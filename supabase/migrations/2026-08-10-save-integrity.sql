-- ════════════════════════════════════════════════════════════════════════
-- SAVE INTEGRITY — server-authoritative guards on public.game_saves
-- (2026-08-10 · pairs with the b317 client reconcile-gate)
--
-- WHY: a fresh/empty client (new device, or a reinstalled iOS PWA whose storage
-- is separate from Safari's) could upload an empty snapshot over a substantial
-- cloud save and reset a real character. The b317 client fix (reconcile-gate +
-- symmetric thin-guard) is the FIRST line of defense. THIS is the authoritative
-- backstop the client cannot bypass — the Idle-Clans-style model where the DB
-- itself refuses a write that would destroy real progress and stamps its own
-- trustworthy time.
--
-- TWO GUARANTEES:
--   1. saved_at is stamped by the SERVER (now()), never trusted from the client.
--      Kills the clock-skew class (audit V3): a device with a wrong/fast clock
--      can no longer write a "future" save that poisons conflict resolution on
--      every other device.
--   2. A save that CATASTROPHICALLY REGRESSES an existing one is REJECTED.
--      total_level only ever grows in this game, so an incoming totalLevel below
--      half the stored value is a fresh/empty/corrupt save and must never
--      overwrite a real one (audit V1, and the worst of V2/V4). New accounts (no
--      prior row) and normal growth are unaffected.
--
-- SAFE TO RE-RUN: create-or-replace function + drop-if-exists trigger.
--
-- ⚠️ REVIEW NOTES (read before applying):
--   • A LEGITIMATE "hard reset / new game" feature (if one exists or is added)
--     MUST delete the row then insert a fresh one — a DELETE+INSERT does not hit
--     the UPDATE regression check. A plain UPDATE that shrinks the save WILL be
--     rejected by design. Confirm no current feature relies on an in-place
--     regressive UPDATE before applying.
--   • The rule keys on total_level only (the one generated column). It is a
--     catastrophic-clobber backstop, not a full anti-cheat / full data-loss
--     guard — gold/items regressions are not caught here (out of scope; the
--     client guard + reconcile-gate cover the reset case).
--   • APPLY ON A SUPABASE BRANCH FIRST, verify normal saves still succeed and a
--     synthetic empty-over-real upsert is rejected, THEN merge to production.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.hr_guard_game_save()
returns trigger
language plpgsql
as $$
declare
  old_tl int;
  new_tl int;
  -- 16 skills x 99 = 1584 is the real ceiling today; the live leader is at 769.
  -- 5000 leaves room for new skills without ever being reachable honestly.
  c_max_total_level constant int := 5000;
  -- Below this a save is PLAINLY THIN — the fresh/empty client this file exists to
  -- stop. 40 is the client's OWN FRESH_FLOOR (decideRestore, src/net/auth.js): at or
  -- under it the client RESTORES instead of uploading, so no honest client write ever
  -- lands here. A brand-new character is totalLevel 22.
  c_thin_total_level constant int := 40;
begin
  -- (1) Server-authoritative timestamp — ignore whatever the client sent.
  new.saved_at := now();

  -- (1b) PLAUSIBILITY CEILING — refuse the forgery instead of ratcheting on it.
  --
  -- ⚠ THIS IS THE CONDITION §2 SHIPS ON, and without it the guard below is a
  --   PERMANENT, CLIENT-TRIGGERABLE SAVE LOCK. Measured on PG18, not reasoned:
  --
  --     totalLevel = 2000000000 (one devtools write)  ACCEPTED
  --     the same player's next honest autosave (771)  REFUSED (23514)
  --     and every autosave after it, forever          REFUSED (23514)
  --
  --   The client has no recovery path — src/net/sync.js never issues a DELETE,
  --   so only DELETE+INSERT escapes it. The player just gets a permanent
  --   "Reconnecting…" pill and a kill-toast every 60s. And it is reachable by
  --   ACCIDENT as readily as by cheating: any transient garbage totalLevel from
  --   a save-migration bug latches the account out just as hard.
  --
  --   Worse, it converts a self-forgery into a cross-player harm, which is the
  --   one property this whole program exists to prevent. `leaderboard_ranked`
  --   ranks hr_lb_num(gs.snapshot,'totalLevel') straight out of game_saves with
  --   NO clamp. Today a forged #1 is self-correcting — the next honest save
  --   overwrites it. With a ratchet and no ceiling, the forged value can never
  --   be written down again: the board stays poisoned permanently.
  --
  --   Checked on INSERT as well as UPDATE, deliberately. The regression rule
  --   below cannot fire on an INSERT (there is no old row), so an INSERT is
  --   exactly how you would plant the value that latches every later UPDATE.
  begin
    new_tl := (new.snapshot->>'totalLevel')::int;
  exception when others then
    new_tl := null;
  end;
  if new_tl is not null and new_tl > c_max_total_level then
    raise exception
      'save rejected: implausible totalLevel % (ceiling %) for user %/slot %',
      new_tl, c_max_total_level, new.user_id, new.slot
      using errcode = 'check_violation';
  end if;

  -- (2) Regression rejection — only meaningful against an EXISTING row.
  --     On a plain INSERT (new account) there is nothing to protect yet.
  --     NOTE: new.total_level (a generated column) is NOT yet computed inside a
  --     BEFORE trigger, so read totalLevel straight from the incoming snapshot.
  if tg_op = 'UPDATE' then
    old_tl := old.total_level;                        -- already stored/computed
    -- new_tl was parsed once in (1b), including its null/garbage handling.
    -- It used to be re-parsed here; one expression, parsed twice, is how the
    -- two copies drift apart later.

    -- ⚠ THE `new_tl <= c_thin_total_level` CLAMP IS LOAD-BEARING. Without it this
    --   rule is a CONFIRMED false positive on the live write path, measured on PG18
    --   through the literal PostgREST upsert as role `authenticated`:
    --
    --     second device, cloud holds 900, client honestly uploads 130 -> REFUSED 23514
    --
    --   That is not an attack, it is `decideRestore` (src/net/auth.js) doing its job.
    --   It returns `adopt` — keep local, upload it over the cloud — whenever local
    --   wins on time and localTL > FRESH_FLOOR (40), HOWEVER much bigger the cloud
    --   is; that behaviour is pinned by a test at smoke-test.js:13177. So the whole
    --   band  40 < localTL < cloudTL/2  is a write the shipped client deliberately
    --   makes and this trigger would permanently refuse.
    --
    --   And it does not converge. A refused write never advances `saved_at`, so local
    --   keeps winning on time and the client re-uploads the same save forever — while
    --   NOTHING in src/** handles 23514 (zero hits for it, or for check_violation), so
    --   the player just gets a "Reconnecting…" pill and a kill-toast every 60 seconds.
    --   Round 2 puts new players on second devices, so this would have been a
    --   launch-blocking outage introduced by a guard meant to protect them.
    --
    --   The clamp keeps the guard's ACTUAL job intact. What it exists to stop is an
    --   EMPTY client clobbering a real save — and an empty save is thin by definition.
    --   A legitimate smaller save from another device is not. Using the client's own
    --   FRESH_FLOOR as the line means the two surfaces agree by construction rather
    --   than by coincidence.
    if old_tl is not null and old_tl > 0
       and new_tl is not null
       and new_tl <= c_thin_total_level
       and new_tl < old_tl * 0.5 then
      raise exception
        'save rejected: totalLevel regression % -> % (>50%% drop) for user %/slot %',
        old_tl, new_tl, new.user_id, new.slot
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists hr_guard_game_save on public.game_saves;
create trigger hr_guard_game_save
  before insert or update on public.game_saves
  for each row execute function public.hr_guard_game_save();

-- ── §3. THE COMMIT GATE ──────────────────────────────────────────────────
-- This file shipped with NO self-verifying block, in violation of the repo's
-- own rule ("every migration must ship a self-verifying `do $$` block; that
-- block is the commit gate"). Its header instead said: "APPLY ON A SUPABASE
-- BRANCH FIRST, verify normal saves still succeed and a synthetic empty-over-
-- real upsert is rejected, THEN merge to production." That verification had
-- never been run in the ~4 days the file sat in the repo. An instruction to a
-- human is not a control; this is.
--
-- It matters more than usual here because this trigger sits on the table that
-- holds the ONLY copy of every beta player's progress, and because the danger
-- is symmetric: a guard that refuses an honest autosave takes the live game
-- down just as surely as a missing guard loses data. So the gate asserts BOTH
-- directions — every honest shape is accepted, every hostile shape refused —
-- and pairs each refusal with a control, so "refuses everything" cannot pass
-- as "refuses the right things".
--
-- Everything runs inside a subtransaction rolled back by a raised HR999.
-- PL/pgSQL variables survive that rollback; the rows do not. §3b re-checks.
do $$
declare
  v_u    uuid;
  v_year int;
  v_tl   int;
  v_ins_huge boolean := false;
  v_upd_empty boolean := false;
  v_upd_huge  boolean := false;
  v_recovered boolean := false;
  v_thin      boolean := false;
  v_fresh     boolean := false;
begin
  select u.id into v_u from auth.users u
    where not exists (select 1 from public.game_saves g where g.user_id = u.id and g.slot = 4)
    limit 1;

  if v_u is null then
    raise notice 'save-integrity gate SKIPPED: no auth.users row with a free slot 4 to hang a '
                 'game_saves FK on. THE GUARD IS NOT BEHAVIOURALLY PROVEN ON THIS DATABASE.';
  else
    begin
      -- (a) An implausible totalLevel is refused ON INSERT. Checked first and
      --     deliberately: the regression rule cannot fire on an INSERT, so an
      --     INSERT is exactly how you would plant the value that latches every
      --     later UPDATE.
      begin
        insert into public.game_saves (user_id, slot, snapshot)
          values (v_u, 4, jsonb_build_object('totalLevel', 2000000000));
      exception when sqlstate '23514' then v_ins_huge := true;
      end;
      if not v_ins_huge then
        raise exception 'S1b: an implausible totalLevel was ACCEPTED on INSERT — the ceiling is not applied to inserts';
      end if;

      -- (b) The client's saved_at is overwritten with the server clock.
      insert into public.game_saves (user_id, slot, snapshot, saved_at)
        values (v_u, 4, jsonb_build_object('totalLevel', 770), timestamptz '2099-01-01');
      select extract(year from saved_at)::int into v_year
        from public.game_saves where user_id = v_u and slot = 4;
      if v_year <> extract(year from now())::int then
        raise exception 'guarantee 1 failed: a client-authored saved_at survived (stored year %)', v_year;
      end if;

      -- (c) CONTROL — an honest growth save is ACCEPTED and stored.
      update public.game_saves set snapshot = jsonb_build_object('totalLevel', 771)
       where user_id = v_u and slot = 4;
      select total_level into v_tl from public.game_saves where user_id = v_u and slot = 4;
      if v_tl is distinct from 771 then
        raise exception 'control failed: an honest save was not stored (total_level = %)', v_tl;
      end if;

      -- (d) The empty-over-real clobber is REFUSED (the reason the file exists).
      begin
        update public.game_saves set snapshot = jsonb_build_object('totalLevel', 1)
         where user_id = v_u and slot = 4;
      exception when sqlstate '23514' then v_upd_empty := true;
      end;
      if not v_upd_empty then
        raise exception 'X1: an empty-over-real clobber was ACCEPTED — the guard does nothing';
      end if;

      -- (e) An implausible totalLevel is REFUSED on UPDATE, so it can never
      --     become the `old_tl` that the regression rule ratchets against.
      begin
        update public.game_saves set snapshot = jsonb_build_object('totalLevel', 2000000000)
         where user_id = v_u and slot = 4;
      exception when sqlstate '23514' then v_upd_huge := true;
      end;
      if not v_upd_huge then
        raise exception 'S1: an implausible totalLevel was ACCEPTED on UPDATE — one write latches this account out of cloud save permanently';
      end if;

      -- (f) THE ANTI-LATCH ASSERTION. After both refusals the player must still
      --     be able to save honestly. This is the one that would have caught the
      --     permanent save lock: with a ratchet and no ceiling, (e) would have
      --     stored 2000000000 and this next honest save would fail forever.
      update public.game_saves set snapshot = jsonb_build_object('totalLevel', 772)
       where user_id = v_u and slot = 4;
      select total_level into v_tl from public.game_saves where user_id = v_u and slot = 4;
      v_recovered := (v_tl = 772);
      if not v_recovered then
        raise exception 'ANTI-LATCH FAILED: after a refused write the account can no longer save (total_level = %)', v_tl;
      end if;

      -- ⚠ (g)-(j) EXIST BECAUSE THE FIRST VERSION OF THIS GATE PASSED ON A GUARD
      --   THAT WOULD HAVE TAKEN THE LIVE GAME DOWN. Every probe above tests a
      --   REFUSAL, plus one growth control. None of them touched the two shapes
      --   that make up virtually all real traffic — an unchanged level, and the
      --   b317 adopt path — so a rule that refused both would have shipped green.
      --   A gate made only of refusals proves the guard says no. It does not
      --   prove it says yes to the game.

      -- (g) CONTROL — the shape >99% of live autosaves take: an UNCHANGED total
      --     level. Nothing else in this gate probes it.
      update public.game_saves set snapshot = jsonb_build_object('totalLevel', 772)
       where user_id = v_u and slot = 4;
      select total_level into v_tl from public.game_saves where user_id = v_u and slot = 4;
      if v_tl is distinct from 772 then
        raise exception 'SAME-LEVEL CONTROL FAILED: an unchanged-level autosave was refused (total_level = %)', v_tl;
      end if;

      -- (h) CONTROL — the b317 adopt path. decideRestore() uploads a SMALLER local
      --     save whenever local is newer and localTL > 40, however big the cloud is.
      --     Refusing it is a permanent save lock: a refusal never advances saved_at,
      --     so the client re-adopts and re-uploads forever, and nothing handles 23514.
      update public.game_saves set snapshot = jsonb_build_object('totalLevel', 300)
       where user_id = v_u and slot = 4;
      select total_level into v_tl from public.game_saves where user_id = v_u and slot = 4;
      if v_tl is distinct from 300 then
        raise exception 'ADOPT-BAND CONTROL FAILED: an honest smaller save from a second device was refused (total_level = %)', v_tl;
      end if;

      -- (i) ...and the clobber backstop still bites at the floor, so
      --     c_thin_total_level cannot be quietly lowered to nothing.
      begin
        update public.game_saves set snapshot = jsonb_build_object('totalLevel', 40)
         where user_id = v_u and slot = 4;
      exception when sqlstate '23514' then v_thin := true;
      end;
      if not v_thin then
        raise exception 'X2: a thin save at the fresh floor was ACCEPTED over a real one';
      end if;

      -- (j) THE ROUND-2 BAND. The thin clamp concentrates every remaining refusal
      --     into new_tl <= 40 — which is exactly where a brand-new character lives
      --     (fresh = 22). Round 2 is a full wipe, so on day one EVERY player is in
      --     this band. It has to accept them and still refuse an empty clobber.
      delete from public.game_saves where user_id = v_u and slot = 4;
      insert into public.game_saves (user_id, slot, snapshot)
        values (v_u, 4, jsonb_build_object('totalLevel', 22));
      update public.game_saves set snapshot = jsonb_build_object('totalLevel', 22)
       where user_id = v_u and slot = 4;
      update public.game_saves set snapshot = jsonb_build_object('totalLevel', 25)
       where user_id = v_u and slot = 4;
      select total_level into v_tl from public.game_saves where user_id = v_u and slot = 4;
      if v_tl is distinct from 25 then
        raise exception 'NEW-PLAYER CONTROL FAILED: a fresh account cannot save (total_level = %)', v_tl;
      end if;
      begin
        update public.game_saves set snapshot = jsonb_build_object('totalLevel', 1)
         where user_id = v_u and slot = 4;
      exception when sqlstate '23514' then v_fresh := true;
      end;
      if not v_fresh then
        raise exception 'X3: an empty client clobbered a fresh account';
      end if;
      update public.game_saves set snapshot = jsonb_build_object('totalLevel', 26)
       where user_id = v_u and slot = 4;
      select total_level into v_tl from public.game_saves where user_id = v_u and slot = 4;
      if v_tl is distinct from 26 then
        raise exception 'NEW-PLAYER ANTI-LATCH FAILED: a refused write latched a fresh account (total_level = %)', v_tl;
      end if;

      raise exception 'save-integrity gate rollback' using errcode = 'HR999';
    exception when sqlstate 'HR999' then
      null;  -- every row above is undone; the assertions already ran
    end;

    -- (§3b) the probe left nothing behind.
    if exists (select 1 from public.game_saves where user_id = v_u and slot = 4) then
      raise exception 'the save-integrity gate left a row behind';
    end if;

    raise notice 'save-integrity gate PASSED — saved_at is server-authored, honest saves accepted, '
                 'clobber and implausible values refused on INSERT and UPDATE, and a refusal does not latch.';
  end if;
end $$;
