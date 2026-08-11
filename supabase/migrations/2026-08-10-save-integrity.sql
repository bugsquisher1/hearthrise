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
begin
  -- (1) Server-authoritative timestamp — ignore whatever the client sent.
  new.saved_at := now();

  -- (2) Regression rejection — only meaningful against an EXISTING row.
  --     On a plain INSERT (new account) there is nothing to protect yet.
  --     NOTE: new.total_level (a generated column) is NOT yet computed inside a
  --     BEFORE trigger, so read totalLevel straight from the incoming snapshot.
  if tg_op = 'UPDATE' then
    old_tl := old.total_level;                        -- already stored/computed
    begin
      new_tl := (new.snapshot->>'totalLevel')::int;   -- may be null/garbage
    exception when others then
      new_tl := null;
    end;

    if old_tl is not null and old_tl > 0
       and new_tl is not null
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
