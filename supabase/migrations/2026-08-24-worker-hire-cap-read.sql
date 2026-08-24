-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-24-worker-hire-cap-read.sql — THE PAID CREW CAP READS ITS OWN ROW
--
-- FOUND LIVE, by playing (the play gate's first live catch): Tyler owns the
-- worker_hire rung (player_progress kind='unlock' key='worker_hire' value=1),
-- has a free slot (Homestead, crew 0/1), clicked Hire — and hr_worker_hire
-- answered crew_cap_reached with paid_cap = 0. Every hire, for every player,
-- has refused this way since workers shipped.
--
-- ROOT CAUSE — two consumers, two expectations of one projection.
-- hr_worker_hire reads its paid cap from hr_unlock_levels(uid, slot), assuming
-- it "projects every unlock the player owns". It does not: that function is
-- the PERK channel's projection and deliberately filters
--   u.namespace in ('room', 'plot', 'property')
-- (its own comment explains why recipe is excluded; worker/bank were simply
-- never in its world). worker_hire's namespace is 'worker' — invisible — so
-- the cap coalesces to 0 and the refusal fires with the crew at zero.
--
-- THE FIX — hr_worker_hire reads the unlock row DIRECTLY, the same store
-- hr_unlock_buy writes (kind='unlock', key='worker_hire', period_key='',
-- MAX-merged value). hr_unlock_levels is left byte-identical: widening the
-- perk projection would forward worker/bank magnitudes into hr_perks_of's
-- envelope, a blast radius this one-line consumer does not need.
--
-- Everything else in hr_worker_hire is restated verbatim from
-- 2026-08-25-workers.sql (names, idempotency, rate gate, journal).
--
-- REVERSIBILITY: re-apply 2026-08-25-workers.sql §hr_worker_hire.
-- SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.hr_worker_hire(int, uuid)') is null then
    raise exception 'hr_worker_hire is absent — apply 2026-08-25-workers.sql first';
  end if;
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is absent';
  end if;
end $$;

create or replace function public.hr_worker_hire(p_slot integer, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c_max_crew constant int := 6;         -- an absolute fuse; the paid cap is finer
  v_uid    uuid := auth.uid();
  v_state  public.player_state%rowtype;
  v_n      int;                          -- current crew size
  v_cap    int;                          -- paid crew cap (worker_hire unlock level)
  v_uidw   text;
  v_name   text;
  v_cached jsonb;
  c_names  constant text[] := array['Aldric','Berta','Cedric','Dagny','Edwin','Freya',
    'Gareth','Hilda','Ivor','Jorunn','Kellan','Liesl','Magnus','Nella','Osric','Petra'];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select result into v_cached from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_cached is not null then return v_cached; end if;
  if not public.hr_rpc_gate('worker_hire') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  select count(*) into v_n from public.player_workers where user_id = v_uid and slot = p_slot;
  /* THE PAID CAP — read from the unlock's OWN row, the store hr_unlock_buy
     writes. NOT hr_unlock_levels: that is the perk channel's projection and it
     filters to ('room','plot','property'), which silently zeroed this cap for
     every player (found live 2026-08-24). */
  select coalesce(greatest(0, least(max(pp.value), c_max_crew))::int, 0) into v_cap
    from public.player_progress pp
   where pp.user_id = v_uid and pp.slot = p_slot
     and pp.kind = 'unlock' and pp.key = 'worker_hire' and pp.period_key = '';
  if v_n >= least(v_cap, c_max_crew) then
    return jsonb_build_object('ok', false, 'error', 'crew_cap_reached',
      'crew', v_n, 'paid_cap', v_cap);
  end if;

  select n into v_name from unnest(c_names) as n
    where n not in (select name from public.player_workers where user_id = v_uid and slot = p_slot)
    order by array_position(c_names, n) limit 1;
  if v_name is null then v_name := 'Worker ' || (v_n + 1)::text; end if;
  v_uidw := 'w' || replace(gen_random_uuid()::text, '-', '');

  insert into public.player_workers (user_id, slot, uid, name, skill, target_id, xp, acc_ms)
    values (v_uid, p_slot, v_uidw, v_name, null, null, 0, 0);
  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (v_uid, p_slot, 'worker', 'worker_hire',
            jsonb_build_object('uid', v_uidw, 'name', v_name, 'crew', v_n + 1, 'paid_cap', v_cap));

  v_cached := jsonb_build_object('ok', true, 'uid', v_uidw, 'name', v_name, 'crew', v_n + 1);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'worker_hire', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

-- ── SELF-CHECK: the cap read sees a namespace='worker' unlock ────────────────
do $$
declare v int;
begin
  -- a synthetic read through the SAME expression the function now uses, against
  -- a fabricated row in a temp copy is overkill here; assert the structural
  -- facts instead: the function body no longer references hr_unlock_levels,
  -- and the perk projection is untouched.
  if (select pg_get_functiondef(oid) from pg_proc where proname='hr_worker_hire' limit 1)
       like '%from public.hr_unlock_levels%' then
    raise exception 'hr_worker_hire still reads hr_unlock_levels — the zeroed-cap bug is back';
  end if;
  if (select pg_get_functiondef(oid) from pg_proc where proname='hr_unlock_levels' limit 1)
       not like '%''room'', ''plot'', ''property''%' then
    raise exception 'hr_unlock_levels changed — this file promised to leave the perk projection alone';
  end if;
end $$;
