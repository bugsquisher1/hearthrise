-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-22-frame-push-channel.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE PUSH CHANNEL'S SERVER HALF, AND NOTHING ELSE.
-- Implements option (b) of docs/design/LIVE_COUNTERS_PUSH.md §1: one frame per
-- accepted write, broadcast from inside the database to ONE private topic, per
-- docs/planning/WORLD_TICK_DESIGN.md §7.
--
-- ⚠ NOTHING IN THIS FILE MOVES VALUE, AND NOTHING IN IT CAN BE REACHED BY A
--   CLIENT. It adds one boolean column to an operator table that ships false,
--   two SECURITY DEFINER functions granted to NOBODY, one AFTER trigger that
--   returns immediately while the boolean is false, and one RECEIVE-ONLY RLS
--   policy on realtime.messages. Applying this file changes the behaviour of
--   exactly nothing until somebody writes a row by hand.
--
-- ── WHY A TRIGGER ON player_state, AND NOT A CALL INSIDE hr_tick_settle ─────
-- The brief offered both. The trigger wins on three counts, and the third is
-- the one that makes it not a preference:
--
--   1. IT CATCHES BOTH PRODUCERS. §7.1 fixes `frame = player_state.version`
--      precisely because the edge (intents) and the world tick both cause
--      frames, and a second counter would have to be kept in step with the
--      first. `version` is bumped by hr_apply under its per-character row lock
--      whichever caller asked, so a trigger on the column that IS the frame
--      number is the one emitter that cannot miss a producer or invent a
--      number. A frame the database did not stamp does not exist.
--   2. IT TOUCHES NO MONEY FUNCTION. No `create or replace` on hr_apply or
--      hr_tick_settle, so no live hash moves on the functions that write player
--      value, and no second adversarial review of the payment path.
--   3. A SHADOW APPLY EMITS NOTHING BY CONSTRUCTION, NOT BY A FLAG.
--      2026-09-21-world-tick-settle-fence.sql §3(8) writes NO player_state row
--      in shadow mode — it journals into hr_tick_shadow and returns. A trigger
--      on player_state therefore CANNOT fire on a shadow settle. That is a
--      property of where the trigger is hung, and it survives somebody
--      forgetting a flag. s9 asserts it by executing a shadow settle.
--
-- ── THE ONE PROPERTY THAT IS NON-NEGOTIABLE ────────────────────────────────
-- A PUSH FAILURE MAY NEVER FAIL A PAYMENT. hr_apply has already computed,
-- clamped and journalled the value by the time this trigger runs; the frame is
-- a COPY of a fact the database already holds. So the whole emitter body sits
-- inside `exception when others then raise warning`, and every reason it could
-- fail — Realtime absent, realtime.send missing, a payload over the 3,000 kB
-- broadcast limit, a permission change — degrades to "no frame this time",
-- which §7.2's key-level replace heals on the next frame and which the existing
-- 90 s poll heals anyway. s5 executes this: a deliberately broken emitter must
-- leave the UPDATE committed.
--
-- ── WHAT IT COSTS, BEFORE ITS BYTES (LIVE_COUNTERS_PUSH.md §3) ──────────────
-- One realtime.messages row per accepted write. That table is Realtime's own,
-- partitioned daily with ~3-day retention, and is NOT subject to
-- hr_ledger_prune's measured 480,000 rows/day ceiling — which is the ceiling
-- that makes per-tick journalling in player_ledger impossible above ~56
-- continuously-active characters. Frames per day per continuously-active
-- character: 960 at the shipped 90 s flush, 8,640 at a 10 s flush. The
-- projection read this trigger performs costs a measured 3.23 ms
-- (docs/design/restore-runbook.md §14) on top of hr_apply's 9.35 ms — a 35%
-- increase in the cost of a write, which is why `frame_push` ships FALSE and
-- arming it is a decision with a number attached, not a convenience.
--
-- ⚠ AND IT IS PAID TWICE. `wal_level = logical` with two replication slots
--   decodes every WAL record (measured: 7.16 h of CPU across 4.5M records, the
--   largest single consumer in this database). Budget the extra insert at
--   ~1 kB of WAL, decoded twice.
--
-- ── SECURITY POSTURE ───────────────────────────────────────────────────────
--   · No new role. No new grant to any role a request can arrive as.
--   · Both functions: `revoke execute … from public` FIRST (PostgreSQL grants
--     EXECUTE to PUBLIC by default on a new function, and a SECURITY DEFINER
--     function left public is the whole exploit), then from anon,
--     authenticated, service_role, hr_engine and hr_tick explicitly.
--   · realtime.messages gets a SELECT policy and NO INSERT POLICY AT ALL. A
--     client-writable topic is SERVER IMPERSONATION — a player who can INSERT
--     on their own topic can hand themselves any envelope the client will
--     apply, and the client applies envelopes absolutely. That is the P0 of
--     this area and docs/planning/PRIORITY_BOARD.md already names it.
--   · The topic is spelled in exactly ONE place (hr_frame_topic) so the emitter
--     and the policy cannot drift into a topic the wrong player can read. s3
--     asserts the round trip.
--   · Measured read-only on production by a prior lane: realtime.messages
--     currently has ZERO RLS policies, i.e. private channels are unjoinable
--     today. This file makes exactly one topic shape joinable, by its owner,
--     READ ONLY.
--   · GRANT HYGIENE: no allowlist entry is added, and that is the claim rather
--     than an omission. `hr_assert_grant_hygiene`'s two reports are
--     `ungated_client_rpcs` (functions a client role can execute) and
--     `engine_execute_outside_allowlist` (functions hr_engine can execute).
--     These functions are executable by NEITHER, so an allowlist entry would be
--     a record of a grant that does not exist — which
--     2026-09-21-engine-allowlist-tick-settle.sql's own header calls out as the
--     failure mode. s7 asserts the detector agrees, in both directions.
--
-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ────────────────────────────────
--   · It does not add a table to `supabase_realtime`. The publication stays
--     {chat_messages}. 2026-09-06-realtime-publication-trim.sql is the only
--     lever this project has on a WAL poller measured at ~61% of all exec time,
--     and option (a) would have reversed it. s8 asserts the publication is
--     unmoved.
--   · It does not arm anything. `frame_push` ships false.
--   · It does not carry `inventory` in the patch yet — WORLD_TICK_DESIGN.md §7a
--     step 1 (the inventory/bank ABSOLUTE flip) lands first. The patch key set
--     is a column on the config row so that ordering is an operator decision
--     and not a redeploy.
--
-- ── REVERSIBLE ─────────────────────────────────────────────────────────────
--   `update public.hr_tick_config set frame_push = false;`  stops every frame
--   dead, with no deploy, no schema change and no player-visible effect. A full
--   undo is `drop trigger hr_frame_push on public.player_state` +
--   `drop function public.hr_frame_emit(), public.hr_frame_topic(uuid,int)` +
--   `drop policy "hr_frame_receive_own_topic" on realtime.messages`.
--   Re-applying this file is a no-op.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT — fail closed if what this builds on is absent ─────────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first — player_state is missing';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'hr_state_of is missing — the frame has no payload to carry';
  end if;
  if to_regclass('public.hr_tick_config') is null then
    raise exception 'run 2026-09-21-world-tick-settle-fence.sql first — hr_tick_config is missing';
  end if;
end $$;

-- ── §1 THE KILL SWITCH — one additive column on the existing operator row ───
-- It lives on hr_tick_config rather than in a new table because it is the same
-- kind of fact as `enabled` and `shadow`: an operator flip with no deploy. The
-- table already has RLS enabled and forced with zero policies and no grant to
-- any role a request can arrive as (settle-fence e3/e22c), so the switch
-- inherits that posture rather than restating it.
alter table public.hr_tick_config
  add column if not exists frame_push boolean not null default false;

-- WHICH TOP-LEVEL ENVELOPE KEYS A FRAME STATES. §7.2: whole keys, never paths.
-- `inventory` and `bank` are ABSENT and must stay absent until the ABSOLUTE
-- flip lands (§7a step 1): a pushed inventory frame into a client whose fold is
-- a one-way Math.max ratchet reproduces the 2026-09-13 bug class at the tick's
-- resolution. That is an ordering constraint, so it is a value an operator
-- changes, not a redeploy.
alter table public.hr_tick_config
  add column if not exists frame_keys text[] not null
    default array['state','skills','buffs','place']::text[];

do $$
begin
  -- A frame key must be a key hr_state_of actually projects. A typo here is a
  -- key that silently never arrives, which is indistinguishable from a bug in
  -- the client and is the hardest shape of this to debug.
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_frame_keys_known') then
    alter table public.hr_tick_config
      add constraint hr_tick_config_frame_keys_known check (
        frame_keys <@ array['state','skills','buffs','place','dungeon_cooldowns',
                            'inventory','bank','equipment','enchant','workers',
                            'farm','progress']::text[]
        and array_length(frame_keys, 1) between 1 and 12);
  end if;
end $$;

-- ── §2 THE TOPIC, SPELLED ONCE ──────────────────────────────────────────────
-- The emitter and the RLS policy must agree about what a topic IS, and the only
-- way to guarantee that is for there to be one spelling. A topic the emitter
-- writes and the policy does not recognise is a frame nobody receives; a topic
-- the policy recognises MORE WIDELY than the emitter writes is another player's
-- envelope. IMMUTABLE so it can be used in an index or a policy without cost.
create or replace function public.hr_frame_topic(p_user uuid, p_slot int)
returns text language sql immutable set search_path = public as $$
  select 'hr:' || p_user::text || ':' || p_slot::text
$$;

-- ── §3 THE EMITTER ──────────────────────────────────────────────────────────
create or replace function public.hr_frame_emit()
returns trigger language plpgsql volatile security definer set search_path = public as $$
declare
  v_cfg  public.hr_tick_config%rowtype;
  v_env  jsonb;
  v_patch jsonb := '{}'::jsonb;
  v_key  text;
begin
  /* ⚠ THE WHOLE BODY IS INSIDE ONE exception BLOCK, AND THAT IS THE POINT.
     hr_apply has already computed, clamped and journalled the value; this
     trigger copies a fact the database already holds. Anything that goes wrong
     here — Realtime absent, a payload over the broadcast limit, a permission
     change, a projection that throws — must degrade to "no frame", never to a
     rolled-back payment. §7.2's key-level replace heals a missed frame on the
     next one, and the 90 s poll heals it regardless. */
  begin
    -- FAIL CLOSED. A missing row, an unreadable table or a NULL reads as "off",
    -- the same direction as every gate in CLAUDE.md §6.
    select * into v_cfg from public.hr_tick_config where id limit 1;
    if not found or not coalesce(v_cfg.frame_push, false) then return null; end if;

    -- NO REALTIME, NO FRAME. The schema is absent in the repo's PGlite replay
    -- and could be absent on a restored database; neither is an error here.
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return null; end if;

    /* THE PAYLOAD IS THE PROJECTION THE CLIENT ALREADY APPLIES. One projection,
       not a second one — a frame assembled from columns would be a second
       statement of the same state and the two would drift. hr_state_of is
       SECURITY DEFINER and reads the row this trigger just wrote, in this
       transaction, under hr_apply's lock. */
    v_env := public.hr_state_of(new.user_id, new.slot);
    if coalesce(v_env->>'ok', 'false') <> 'true' then return null; end if;

    -- WHOLE TOP-LEVEL KEYS, NEVER PATHS (§7.2). A path-addressed patch makes a
    -- missed frame undetectable; a key-level replace is idempotent and
    -- self-healing, which is the entire reason the client may drop a frame.
    foreach v_key in array v_cfg.frame_keys loop
      if v_env ? v_key then v_patch := v_patch || jsonb_build_object(v_key, v_env->v_key); end if;
    end loop;

    /* `frame` IS new.version, READ OFF THE ROW hr_apply JUST WROTE. Never
       incremented here, never defaulted, never synthesised, never taken from a
       request. §7.1: the tick does not allocate frame numbers at all; it
       reports the version hr_apply returned. */
    perform realtime.send(
      jsonb_build_object('t', 'delta', 'frame', new.version, 'patch', v_patch),
      'frame',
      public.hr_frame_topic(new.user_id, new.slot),
      true);        -- PRIVATE. A public topic is every player's envelope.
  exception when others then
    raise warning 'hr_frame_emit: frame % for %/% not sent (%) — the write is committed anyway',
      new.version, new.user_id, new.slot, sqlerrm;
  end;
  return null;      -- AFTER trigger; the return value is ignored by design.
end $$;

-- ── §4 THE TRIGGER ──────────────────────────────────────────────────────────
-- AFTER, so it can never affect the write. FOR EACH ROW, because a frame is per
-- character. `WHEN (new.version is distinct from old.version)` is what makes
-- "a frame" and "an accepted write" the same event: hr_apply bumps `version` on
-- every accepted write and on nothing else, so a housekeeping UPDATE that
-- touches no version emits no frame and cannot be mistaken for one.
drop trigger if exists hr_frame_push on public.player_state;
create trigger hr_frame_push
  after update on public.player_state
  for each row
  when (new.version is distinct from old.version)
  execute function public.hr_frame_emit();

-- ── §5 GRANTS — revoke from PUBLIC first (CLAUDE.md §2) ─────────────────────
-- PostgreSQL grants EXECUTE to PUBLIC by default on a new function. A SECURITY
-- DEFINER function left public is the exploit, not the oversight.
revoke execute on function public.hr_frame_emit() from public;
revoke execute on function public.hr_frame_emit() from anon, authenticated, service_role;
revoke execute on function public.hr_frame_topic(uuid, int) from public;
revoke execute on function public.hr_frame_topic(uuid, int) from anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke execute on function public.hr_frame_emit() from hr_engine';
    execute 'revoke execute on function public.hr_frame_topic(uuid, int) from hr_engine';
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_frame_emit() from hr_tick';
    execute 'revoke execute on function public.hr_frame_topic(uuid, int) from hr_tick';
  end if;
end $$;
-- ⚠ NOT GRANTED TO ANYBODY, DELIBERATELY. A trigger function is invoked by the
--   executor, not by a caller, so it needs no EXECUTE privilege at fire time —
--   and a grant would install a door that has no reason to exist.

-- ── §6 RLS ON realtime.messages — RECEIVE ONLY, ONE TOPIC ───────────────────
-- Guarded, because `realtime` is absent in the repo's PGlite replay and may be
-- absent on a restored database. Where it exists this is the whole client-side
-- authorization story: the player's JWT supplies auth.uid(), and the policy
-- lets them SELECT (= receive) exactly the topics whose second segment is their
-- own id. There is NO insert policy, so no client can ever SEND on any topic.
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'frame-push: realtime.messages absent — RLS section skipped (no-op)';
    return;
  end if;

  begin
    execute 'alter table realtime.messages enable row level security';
  exception when insufficient_privilege then
    raise notice 'frame-push: cannot enable RLS on realtime.messages (not owner) — '
                 'Supabase manages it; the policy below is what matters';
  end;

  if exists (select 1 from pg_policies
              where schemaname = 'realtime' and tablename = 'messages'
                and policyname = 'hr_frame_receive_own_topic') then
    execute 'drop policy "hr_frame_receive_own_topic" on realtime.messages';
  end if;

  /* ⚠ SPLIT_PART, NOT LIKE. `topic like 'hr:' || auth.uid() || ':%'` would also
     match `hr:<uuid>:0:anything`, and "anything" is attacker-chosen. The three
     segments are matched exactly, and the third is a single digit because a
     slot is 0-5 (MAX_SLOT). s3 asserts hr_frame_topic round-trips through
     exactly these three tests, so the spelling cannot drift. */
  execute $p$
    create policy "hr_frame_receive_own_topic"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and split_part((select realtime.topic()), ':', 1) = 'hr'
        and split_part((select realtime.topic()), ':', 2) = (select auth.uid())::text
        and split_part((select realtime.topic()), ':', 3) ~ '^[0-5]$'
      )
  $p$;
  raise notice 'frame-push: realtime.messages receive-only policy installed (no INSERT policy)';
end $$;

-- ── §7 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- PROBE ROWS ONLY. Every row this block touches is one it inserted itself,
-- under a uuid gen_random_uuid() cannot mint, and every predicate binds `v_u` —
-- a variable this block declared (tests/selfcheck-no-global-dml.mjs). The whole
-- block is rolled back regardless of outcome.
do $$
declare
  v_u    uuid := '00000000-0000-4000-8000-00000000fa3e';
  v_t    text;
  v_n    int;
  v_v    bigint;
  v_g    bigint;
  v_txt  text;
  v_sig  text;           -- e4: the signature hr_tick_settle actually carries
  v_code text;           -- e4: that function's source with its comments stripped
  v_env  jsonb;          -- e5: the projection the emitter would have sent
  v_keys text[];         -- e5: the configured frame key set
begin
  begin
    -- ── s1: THE SWITCH SHIPS OFF. The single most important property of
    --        applying this file: it changes the behaviour of nothing.
    if exists (select 1 from public.hr_tick_config where frame_push) then
      raise exception 's1: frame_push shipped TRUE — applying this file would start pushing';
    end if;

    -- ── s1b: and the default key set carries NO inventory/bank, per §7a's
    --         ordering constraint. A pushed inventory frame into a merging
    --         client is the 2026-09-13 class at the tick's resolution.
    if exists (select 1 from public.hr_tick_config
                where frame_keys && array['inventory','bank']::text[]) then
      raise exception 's1b: frame_keys ships with inventory/bank — the ABSOLUTE flip lands first';
    end if;

    -- ── s2: an unknown frame key is refused. A typo is a key that silently
    --        never arrives, which reads as a client bug for weeks.
    begin
      update public.hr_tick_config set frame_keys = array['state','invnetory']::text[] where id;
      raise exception 's2: an unknown frame key was accepted';
    exception when check_violation then null;
    end;

    -- ── s3: ONE SPELLING OF THE TOPIC. The emitter's topic must decompose
    --        through exactly the three tests the RLS policy applies. If these
    --        two ever disagree, a frame either reaches nobody or reaches the
    --        wrong player, and neither is visible from either side alone.
    v_t := public.hr_frame_topic(v_u, 3);
    if split_part(v_t, ':', 1) <> 'hr'
       or split_part(v_t, ':', 2) <> v_u::text
       or split_part(v_t, ':', 3) !~ '^[0-5]$' then
      raise exception 's3: hr_frame_topic (%) does not decompose the way the RLS policy reads it', v_t;
    end if;
    if public.hr_frame_topic(v_u, 0) = public.hr_frame_topic(v_u, 1) then
      raise exception 's3b: two slots of one account share a topic — one character''s frames '
                      'would be delivered as the other''s';
    end if;

    -- ── s4: NO ROLE A REQUEST CAN ARRIVE AS MAY EXECUTE EITHER FUNCTION.
    --        `public` included, because that is the default a new function
    --        ships with and the one an author forgets.
    foreach v_txt in array array['public','anon','authenticated','service_role'] loop
      if has_function_privilege(v_txt, 'public.hr_frame_emit()', 'EXECUTE') then
        raise exception 's4: % can EXECUTE hr_frame_emit — a SECURITY DEFINER function '
                        'reachable by a client role', v_txt;
      end if;
      if has_function_privilege(v_txt, 'public.hr_frame_topic(uuid,int)', 'EXECUTE') then
        raise exception 's4b: % can EXECUTE hr_frame_topic', v_txt;
      end if;
    end loop;

    -- ── THE PROBE CHARACTER. Its own auth.users row, its own player_state row.
    --    Nothing pre-existing is read for identity and nothing pre-existing is
    --    written.
    insert into auth.users (id) values (v_u) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
    values (v_u, 0, 100, 0, 10, 10, 1, now() - interval '1 hour');

    -- ── s5: ★ A PUSH FAILURE MAY NEVER FAIL A PAYMENT ★
    --        The emitter is armed and then made to fail in the way that is
    --        hardest to see: `frame_push` on, with realtime.send absent (the
    --        replay) or present (production). Either way the UPDATE must
    --        commit. This is the property that justifies hanging anything at
    --        all off the money path, and it is EXECUTED rather than asserted.
    update public.hr_tick_config set frame_push = true where id;
    update public.player_state set version = version + 1, gold = gold + 7
     where user_id = v_u and slot = 0;
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    if v_v <> 2 or v_g <> 107 then
      raise exception 's5: the value write did not commit with the emitter armed (version=%, gold=%) — '
                      'a frame that can roll back a payment is worse than no frame at all', v_v, v_g;
    end if;

    -- ── s5b: ★ AND THE SWALLOW IS EXECUTED, NOT TRUSTED ★
    --         The real emitter cannot be made to throw from here without
    --         replacing it, and replacing the live emitter mid-migration is a
    --         risk with no upside: a rollback that did not take would leave
    --         production with a broken one. So the PATTERN is executed on a
    --         probe trigger that throws deliberately, and the real emitter's
    --         possession of that pattern is asserted from its own source in
    --         s5c. Both halves, because either alone is a half-proof.
    --
    --         ⚠ THE PROBE IS SCOPED TO THE PROBE UUID. If this block's
    --           rollback somehow did not take, the residue can only ever fire
    --           for an id gen_random_uuid() cannot mint — never for a player.
    execute $f$
      create or replace function public.hr922_probe_emit()
      returns trigger language plpgsql volatile as $b$
      begin
        if new.user_id <> '00000000-0000-4000-8000-00000000fa3e'::uuid then return null; end if;
        perform set_config('hr922.fires',
          (coalesce(current_setting('hr922.fires', true), '0')::int + 1)::text, true);
        begin
          raise exception 'HR922_DELIBERATE_PUSH_FAILURE';
        exception when others then
          raise warning 'hr922 probe: % (swallowed, as the real emitter swallows)', sqlerrm;
        end;
        return null;
      end $b$;
    $f$;
    execute 'create trigger hr922_probe after update on public.player_state '
         || 'for each row when (new.version is distinct from old.version) '
         || 'execute function public.hr922_probe_emit()';
    perform set_config('hr922.fires', '0', true);

    update public.player_state set version = version + 1, gold = gold + 5
     where user_id = v_u and slot = 0;
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    if v_v <> 3 or v_g <> 112 then
      raise exception 's5b: a THROWING emitter rolled back the payment (version=%, gold=%). '
                      'A push failure may never fail a payment.', v_v, v_g;
    end if;
    if coalesce(current_setting('hr922.fires', true), '0')::int <> 1 then
      raise exception 's5b2: the probe trigger did not fire on a version bump (% fires) — '
                      'the test below would then prove nothing',
                      coalesce(current_setting('hr922.fires', true), '0');
    end if;

    -- ── s5c: …AND THE REAL EMITTER CARRIES THAT PATTERN. Read off its own
    --         installed source, so a later edit that drops the handler is
    --         caught by re-applying this file rather than by a red production.
    v_txt := pg_get_functiondef('public.hr_frame_emit()'::regprocedure);
    if v_txt !~* 'exception\s+when\s+others\s+then' or v_txt !~* 'raise\s+warning' then
      raise exception 's5c: hr_frame_emit has no `exception when others then raise warning` '
                      'handler. hr_apply has already journalled the value by the time this '
                      'trigger runs; anything it can throw would roll back a committed payment.';
    end if;
    if position('realtime.send' in v_txt) = 0 then
      raise exception 's5c2: hr_frame_emit no longer calls realtime.send — it emits nothing';
    end if;
    /* AND THE HANDLER WRAPS THE CALL, not merely coexists with it. In PL/pgSQL
       a handler belongs to the `begin` it TRAILS, so "wraps" spells as "comes
       after" in the source. A handler placed before the send would catch
       nothing the send can throw and would read, to anyone skimming, exactly
       like one that does. */
    if position('exception when others then' in lower(v_txt))
       < position('realtime.send' in lower(v_txt)) then
      raise exception 's5c3: hr_frame_emit''s exception handler comes BEFORE the realtime.send '
                      'call, so it cannot be wrapping it — a payment could be rolled back by a '
                      'transport failure';
    end if;

    -- ── s6: NO VERSION, NO FRAME. The trigger's WHEN clause is what makes
    --        "a frame" and "an accepted write" the same event. hr_apply bumps
    --        `version` on every accepted write and on nothing else, so a
    --        housekeeping UPDATE must emit NO frame — otherwise the client is
    --        handed a frame for a write that moved no player-visible value,
    --        and the frame number it raises its floor to is real.
    update public.player_state set gold = gold + 1
     where user_id = v_u and slot = 0;            -- version UNCHANGED
    if coalesce(current_setting('hr922.fires', true), '0')::int <> 1 then
      raise exception 's6: the trigger fired on an UPDATE that did not move `version` — a '
                      'housekeeping write would be delivered to the client as a frame';
    end if;

    -- ── s6b: THE CONTROL. s6 would pass just as happily on a trigger that had
    --         been dropped, which is the shape of a guard that is decoration.
    update public.player_state set version = version + 1
     where user_id = v_u and slot = 0;
    if coalesce(current_setting('hr922.fires', true), '0')::int <> 2 then
      raise exception 's6b: the trigger did NOT fire on a version bump (% fires) — s6 above '
                      'was measuring a trigger that is not there',
                      coalesce(current_setting('hr922.fires', true), '0');
    end if;

    -- ── s7: THE GRANT-HYGIENE DETECTOR AGREES, IN BOTH DIRECTIONS. No
    --        allowlist entry is added by this file, and this is what makes that
    --        a claim rather than an omission.
    if to_regprocedure('public.hr_assert_grant_hygiene()') is not null then
      declare v_rep jsonb;
      begin
        v_rep := public.hr_assert_grant_hygiene();
        if (v_rep->'ungated_client_rpcs')::text like '%hr_frame_%' then
          raise exception 's7: grant hygiene reports a frame function as a CLIENT-REACHABLE rpc: %',
            (v_rep->'ungated_client_rpcs')::text;
        end if;
        if (v_rep->'engine_execute_outside_allowlist')::text like '%hr_frame_%' then
          raise exception 's7b: grant hygiene reports a frame function outside hr_engine''s '
                          'allowlist — it must not be executable by hr_engine at all: %',
            (v_rep->'engine_execute_outside_allowlist')::text;
        end if;
      end;
    else
      raise notice 's7 SKIPPED: hr_assert_grant_hygiene is not installed in this database';
    end if;

    -- ── s8: THE PUBLICATION IS UNMOVED. Option (a) would have put player_state
    --        into supabase_realtime and reversed
    --        2026-09-06-realtime-publication-trim.sql — the only lever this
    --        project has on a WAL poller measured at ~61% of all exec time.
    select count(*) into v_n from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'player_state';
    if v_n <> 0 then
      raise exception 's8: player_state is in supabase_realtime — this file chose BROADCAST '
                      'precisely so that it would not have to be';
    end if;

    -- ── s9: NO INSERT POLICY ON realtime.messages. A client-writable topic is
    --        server impersonation: the client applies envelopes ABSOLUTELY, so
    --        a player who can send on their own topic can hand themselves any
    --        state they like. Receive-only, or nothing.
    if to_regclass('realtime.messages') is not null then
      select count(*) into v_n from pg_policies
       where schemaname = 'realtime' and tablename = 'messages'
         and cmd in ('INSERT','ALL','UPDATE','DELETE');
      if v_n <> 0 then
        raise exception 's9: realtime.messages carries % write policy/policies — a client that '
                        'can SEND on a topic can forge an envelope', v_n;
      end if;
      select count(*) into v_n from pg_policies
       where schemaname = 'realtime' and tablename = 'messages'
         and policyname = 'hr_frame_receive_own_topic';
      if v_n <> 1 then
        raise exception 's9b: the receive policy is not installed (% found)', v_n;
      end if;
    else
      raise notice 's9 SKIPPED: realtime.messages absent in this database';
    end if;

    -- ════════════════════════════════════════════════════════════════════
    -- §4 OF THE SECURITY REVIEW (SEC_PUSH_CHANNEL_M5_2026-09-23.md) — the
    -- conditions Security named before it will GO this migration. s1-s9 above
    -- cover 1, 3, 4, 5(flag half) and 10; e1-e6 below cover the rest that can
    -- be proved from inside this file. Condition 8 (the trigger's added
    -- lock-hold, MEASURED) cannot be: it needs a live database under load and
    -- it is named OPEN in docs/design/LIVE_COUNTERS_PUSH.md §3.6.
    -- ════════════════════════════════════════════════════════════════════

    -- ── e1 (condition 2): ★ THE POLICY BINDS IDENTITY, NOT SHAPE ★
    --     The single highest-blast-radius property in this file: the payload is
    --     the WHOLE hr_state_of projection, so a policy scoped by topic SHAPE
    --     (`topic like 'hr:%'`) rather than by the subscriber's own uid would
    --     let any authenticated player stream any other player's gold, bag, XP
    --     and bank. It is a one-word difference in a `using` clause, and it is
    --     read here off the INSTALLED catalog rather than off this file's own
    --     source — what was applied is the only thing that matters.
    if to_regclass('realtime.messages') is not null then
      select pg_get_expr(polqual, polrelid) into v_txt
        from pg_policy where polname = 'hr_frame_receive_own_topic';
      if v_txt is null then
        raise exception 'e1: the receive policy has no USING expression at all — a policy '
                        'that restricts nothing is worse than none, because it reads as one';
      end if;
      if position('auth.uid()' in v_txt) = 0 then
        raise exception 'e1b: the receive policy does not resolve the subscriber from the JWT '
                        '(auth.uid() absent from: %). A predicate that does not name the '
                        'subscriber cannot exclude anyone.', v_txt;
      end if;
      if v_txt ~* '~~|like|similar to' then
        raise exception 'e1c: the receive policy pattern-matches the topic (%). `hr:<uid>:%%` '
                        'also matches `hr:<uid>:0:anything`, and "anything" is attacker-chosen. '
                        'The segments are compared exactly or not at all.', v_txt;
      end if;
    else
      raise notice 'e1 SKIPPED: realtime.messages absent in this database';
    end if;

    -- ── e2 (condition 2, the executed half): ★ A CROSS-USER TOPIC JOIN SEES
    --     NOTHING ★. "The owner can read" proves nothing; the property is that
    --     a STRANGER cannot. Evaluated as the `authenticated` role, with the
    --     JWT claiming one user and realtime.topic() naming ANOTHER user's
    --     topic — which is exactly the request an attacker sends. Skipped, with
    --     a notice, wherever the realtime schema or the role is absent (the
    --     PGlite replay); it runs on the apply that counts.
    if to_regclass('realtime.messages') is not null
       and exists (select 1 from pg_roles where rolname = 'authenticated') then
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_u::text, 'role', 'authenticated')::text, true);
        perform set_config('realtime.topic',
          public.hr_frame_topic('00000000-0000-4000-8000-0000000051de'::uuid, 0), true);
        set local role authenticated;
        select count(*) into v_n from realtime.messages;
        reset role;
        if v_n <> 0 then
          raise exception 'e2: a subscriber authenticated as one user read % row(s) on ANOTHER '
                          'user''s topic. That is every column hr_state_of projects — gold, bag, '
                          'XP, bank — crossing to a player who is not entitled to it.', v_n;
        end if;
      exception
        when insufficient_privilege or undefined_function or undefined_table then
          reset role;
          raise notice 'e2 SKIPPED: cannot assume `authenticated` here (%)', sqlerrm;
        when others then reset role; raise;
      end;
    else
      raise notice 'e2 SKIPPED: realtime.messages or the authenticated role is absent';
    end if;

    -- ── e3 (condition 6): THE FRAME NUMBER IS NEVER SYNTHESISED. `frame` is
    --     `new.version` read off the row hr_apply just wrote — not incremented,
    --     not defaulted, not drawn from a sequence, not taken from a request.
    --     A synthesised frame is a floor the client raises to a number the
    --     database never stamped, after which the REAL frame at that version is
    --     a duplicate and is never applied.
    v_txt := pg_get_functiondef('public.hr_frame_emit()'::regprocedure);
    if v_txt !~ '''frame''\s*,\s*new\.version' then
      raise exception 'e3: hr_frame_emit no longer puts `new.version` in the frame field — a '
                      'frame the database did not stamp does not exist';
    end if;
    if v_txt ~* 'nextval|new\.version\s*\+|version\s*\+\s*1' then
      raise exception 'e3b: hr_frame_emit derives the frame number instead of reporting it: %',
        substring(v_txt from 1 for 400);
    end if;

    -- ── e3c (condition 6, second half): A VERSION THAT GOES *DOWN* STILL
    --     EMITS. `is distinct from`, not `>`. The client drops it as a reorder,
    --     which is the fail-safe direction; a trigger that stayed silent would
    --     leave the client with no frame at all and no way to know.
    perform set_config('hr922.fires', '0', true);
    update public.player_state set version = version - 1
     where user_id = v_u and slot = 0;
    if coalesce(current_setting('hr922.fires', true), '0')::int <> 1 then
      raise exception 'e3c: a version that moved BACKWARDS emitted no frame. The WHEN clause '
                      'must be `is distinct from`; the client is what decides to drop it.';
    end if;

    -- ── e4 (condition 7): A SHADOW SETTLE EMITS NOTHING — PINNED, NOT
    --     INHERITED. True today by construction: hr_tick_settle's shadow branch
    --     writes hr_tick_shadow and hr_tick_ownership and RETURNS BEFORE
    --     hr_apply, so no player_state row is written and an AFTER UPDATE
    --     trigger cannot fire. That is an argument about another file, and an
    --     argument is not a guard — so it is asserted here, from that
    --     function's own installed source.
    --
    --     ⚠ THE SIGNATURE IS DERIVED, NOT SPELLED (2026-09-23). As first
    --       written this arm asked `to_regprocedure('public.hr_tick_settle
    --       (int)')`, and hr_tick_settle has never had a one-argument form —
    --       the fence's door takes nine. to_regprocedure therefore answered
    --       NULL in every database, the else-arm printed a NOTICE, and the
    --       assertion below could not fail anywhere. An assertion that cannot
    --       fail is not an assertion (CLAUDE.md §4). The oid now comes from
    --       pg_proc BY NAME, so a future argument change cannot silently
    --       re-disable this arm; EVERY overload is graded, because a second
    --       hr_tick_settle carrying its own shadow branch is the same claim
    --       again; and finding NONE raises (e4c) instead of skipping, since §0
    --       already refuses to apply this file without the fence that creates
    --       it. Still a READ: this file states no part of that body.
    --
    --     ⚠ AND IT IS GRADED ON CODE, NOT ON PROSE. The ordering test below
    --       reads the definition with its comments stripped, because
    --       hr_tick_settle's header and its steps (6)-(8) DISCUSS hr_apply
    --       four times before the shadow branch is reached — on the raw text
    --       the first mention of `hr_apply` precedes the first mention of
    --       `hr_tick_shadow` and e4b fires on a function that is correct. A
    --       `--` inside a string literal would strip the rest of that source
    --       line, which can only ever produce a false RED; a silent pass it
    --       cannot produce.
    v_n := 0;
    for v_sig, v_txt in
      select p.oid::regprocedure::text, pg_get_functiondef(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_tick_settle'
       order by p.oid
    loop
      v_n := v_n + 1;
      v_code := regexp_replace(regexp_replace(v_txt, '/\*.*?\*/', ' ', 'gs'), '--[^\n]*', '', 'g');
      if position('hr_tick_shadow' in v_code) = 0 then
        raise exception 'e4: % no longer names hr_tick_shadow — the shadow branch this check '
                        'is about has moved, and the claim is unverified', v_sig;
      end if;
      if position('hr_apply' in v_code) > 0
         and position('hr_tick_shadow' in v_code) > position('hr_apply' in v_code) then
        raise exception 'e4b: % reaches hr_apply BEFORE its shadow branch, so a SHADOW settle '
                        'now writes player_state and emits a frame. A shadow settle is a dry '
                        'run; a client must never be told it happened.', v_sig;
      end if;
      -- ── e4d: …AND IT RETURNS IN BETWEEN. Ordering alone is satisfied by a
      --     shadow branch that writes its journal row and then FALLS THROUGH
      --     to hr_apply, which is the failure e4b names and cannot see. The
      --     `return` that ends the branch is what makes the claim true, so it
      --     is the thing asserted.
      if position('hr_apply' in v_code) > 0
         and substring(v_code from position('hr_tick_shadow' in v_code)
                       for position('hr_apply' in v_code)
                           - position('hr_tick_shadow' in v_code)) !~* '\mreturn\M' then
        raise exception 'e4d: % writes its shadow journal row and reaches hr_apply without '
                        'returning first, so a SHADOW settle pays, writes player_state and '
                        'pushes a frame for a tick that was supposed to be a dry run.', v_sig;
      end if;
    end loop;
    if v_n = 0 then
      raise exception 'e4c: no public.hr_tick_settle is installed, so e4 graded nothing at all. '
                      'The fence that creates it is this file''s declared prerequisite (§0), and '
                      'an arm that homes on no function is decoration, not a guard.';
    end if;

    -- ── e5 (condition 9): THE DELTA STATES WHOLE TOP-LEVEL KEYS OF THE SAME
    --     PROJECTION. §7.2 forbids path patches, and combined with the frame
    --     rule a PARTIAL delta would leave the client holding a state assembled
    --     from two frames that the server never held — the exact failure the
    --     gate exists to forbid, arriving through the emitter instead of the
    --     applier. Every configured key must be a top-level key of hr_state_of.
    v_env := public.hr_state_of(v_u, 0);
    if coalesce(v_env->>'ok', 'false') <> 'true' then
      raise exception 'e5: hr_state_of did not project the probe character, so the key set '
                      'below would be measured against nothing';
    end if;
    select frame_keys into v_keys from public.hr_tick_config where id limit 1;
    foreach v_txt in array coalesce(v_keys, array[]::text[]) loop
      if not (v_env ? v_txt) then
        raise exception 'e5b: frame key `%` is not a top-level key of hr_state_of. The emitter '
                        'would silently send a delta missing it, and the client would hold a '
                        'state assembled from two frames.', v_txt;
      end if;
    end loop;

    -- ── e6 (condition 5, the second half): A MISSING CONFIG ROW EMITS NOTHING.
    --     The flag half is s1; this is the row half. Read from the emitter's
    --     own source rather than by deleting the singleton, which would be
    --     global DML on a table every character's tick reads.
    v_txt := pg_get_functiondef('public.hr_frame_emit()'::regprocedure);
    if v_txt !~* 'if\s+not\s+found\s+or\s+not\s+coalesce' then
      raise exception 'e6: hr_frame_emit no longer fails closed on a missing or NULL config row. '
                      'A gate that treats "no answer" as "on" is the wrong direction (§6).';
    end if;

    raise exception 'HR922_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR922_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'frame-push-channel self-check PASSED (s1-s9, e1-e6 = SEC §4 conditions 1-7, 9, 10; condition 8 is a live measurement and is OPEN); probe rows rolled back';
end $$;
