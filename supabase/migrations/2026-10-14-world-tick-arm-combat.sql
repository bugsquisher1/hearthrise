-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-14-world-tick-arm-combat.sql — M4: THE WORLD TICK PAYS COMBAT.
--
-- STAGED, NOT APPLIED. Backend-authored for Security review, modelled on the
-- M2 gather arm (2026-10-07-world-tick-arm-gather.sql, APPLIED 2026-10-07
-- 18:36 UTC) and its amended P3b/P3c. The Coordinator applies it ONLY after
-- every pre-arm step of the M4 runbook section
-- (docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md, "M4 — combat ARM") is
-- green, via
--   node tools/apply-migration.mjs 2026-10-14-world-tick-arm-combat.sql
-- Never 00:00–00:10 UTC. Never in the same sitting as an edge deploy.
--
-- ★ THE PIN IS FILLED AT THE SECURITY GO, AND NOWHERE ELSE. `c_pin` below is
--   the full 64-hex payload_sha256 the combat bar PASSed on
--   (tools/world-tick-parity.mjs). It is committed as a placeholder because
--   the payload the bar will be read on does not exist yet (two edge deploys
--   restart the count). P0 refuses until it is a real hash, so this file can
--   never arm on a guess. Filling it is the GO commit's only edit.
--
-- ONE CONFIG WRITE: armed_channels {gather} -> {gather,combat}. Every
-- precondition below is EXECUTED against the live rows and RAISES, so the
-- whole file rolls back (one transaction) if any one is false.
--
-- THE F2b CONTRADICTION, AVOIDED BY CONSTRUCTION (the gather arm's 16:34 UTC
-- refusal). P3b's freshness and S2's sentinel read the SAME 2 h window with
-- the SAME predicate the live hr_tick_stall_status uses (F2b: a non-tick
-- `combat` ledger row inside the window unseats the sentinel), and P3c checks
-- that predicate BEFORE the write, naming the earliest arm time. So the arm
-- window is exactly [real return + 2 h, real return + 4 h] and every state in
-- it passes both P3 and S2 (tests/world-tick-arm-combat.mjs C0 vs C2/C3/C4).
--
-- EXCLUDED FROM THE REPLAY CHAIN (tests/schema-apply-order.json `excluded`):
-- arming is earned on THIS database's evidence. A rebuilt or restored
-- database has none and must come back DISARMED and re-earn it.
--
-- KILL (combat only, gather keeps paying): 2026-10-14-world-tick-disarm-combat.sql
--   update public.hr_tick_config set armed_channels = array_remove(armed_channels, 'combat') where id;
-- MASTER KILL (every channel): 2026-10-07-world-tick-disarm.sql.
-- STOP EVERYTHING: update public.hr_tick_config set enabled = false where id;
-- ════════════════════════════════════════════════════════════════════════

do $arm$
declare
  c_pin   constant text := 'SET-AT-SECURITY-GO';
  v_cfg   public.hr_tick_config%rowtype;
  v_n     int;
  v_ms    numeric;
  v_first timestamptz;
  v_stall jsonb;
  v_ent   jsonb;
begin
  -- (P0) THE PIN IS A REAL PAYLOAD HASH (filled at the Security GO).
  if c_pin !~ '^[0-9a-f]{64}$' then
    raise exception 'ARM-P0: c_pin is not a 64-hex payload_sha256 — the Security GO commit fills it with the payload the combat bar PASSed on';
  end if;

  select * into v_cfg from public.hr_tick_config where id;
  if not found then raise exception 'ARM-0: no hr_tick_config row'; end if;

  -- (P1) CONFIG IS THE MEASURED ONE. Gather armed (M2), combat NOT yet, both
  --      driven, the 90 s flush the probes ran at, no frame push, and the
  --      ruling-3.1 CHECK installed (no stack-bearing frame while combat arms).
  if not v_cfg.enabled then raise exception 'ARM-P1: tick disabled'; end if;
  if v_cfg.armed_channels <> array['gather']::text[] then
    raise exception 'ARM-P1: armed_channels is %, expected {gather} (M2 armed, combat not yet)', v_cfg.armed_channels;
  end if;
  if not (v_cfg.channels @> array['gather','combat']::text[]) then
    raise exception 'ARM-P1: channels % lack gather+combat', v_cfg.channels;
  end if;
  if v_cfg.flush_seconds <> 90 or v_cfg.cadence_seconds <> 10 then
    raise exception 'ARM-P1: flush %/cadence % differ from the measured 90/10', v_cfg.flush_seconds, v_cfg.cadence_seconds;
  end if;
  if v_cfg.frame_push then raise exception 'ARM-P1: frame_push is on'; end if;
  if not exists (select 1 from pg_constraint where conname = 'hr_tick_config_combat_frame_ck') then
    raise exception 'ARM-P1: hr_tick_config_combat_frame_ck is absent (apply 2026-10-14-world-tick-m4-party-horizon.sql first; ruling 3.1)';
  end if;
  if to_regclass('public.hr_return_anchor') is null or to_regclass('public.hr_tick_horizon_log') is null then
    raise exception 'ARM-P1: the presence horizon is not installed (apply 2026-10-10-world-tick-presence-horizon.sql first)';
  end if;

  -- (P2) THE EVIDENCE FLOOR ON THE PIN. The evaluator (tools/world-tick-parity.mjs)
  --      is the BAR (>= 12 eligible probes / >= 48 h, replay +-10 %, |z| <= 3.29,
  --      per-probe |z| > 4.3 FAILS, >= 2 ate and >= 2 death probes); this is
  --      only the floor it must have read: 12 closed combat probes, 48 h, on
  --      the pin at both ends, input RETAINED (the replay needs it), and the
  --      pin continuously live from the first counted probe until now (no
  --      probe of ANY channel opened on another payload since; the newest
  --      combat probe is on the pin).
  select count(*), coalesce(sum(extract(epoch from (span_to - span_from)) * 1000), 0), min(opened_at)
    into v_n, v_ms, v_first
    from public.hr_tick_probe
   where channel = 'combat' and status = 'closed'
     and payload_open = c_pin and payload_close = c_pin
     and input is not null;
  if v_n < 12 or v_ms < 48 * 3600 * 1000 then
    raise exception 'ARM-P2: % closed combat probes with retained input / % h on the pin (need >= 12 / >= 48 h)',
      v_n, round(v_ms / 3600000.0, 2);
  end if;
  if exists (select 1 from public.hr_tick_probe
              where opened_at >= v_first
                and (payload_open <> c_pin or coalesce(payload_close, c_pin) <> c_pin)) then
    raise exception 'ARM-P2: a probe opened since % ran on another payload — the edge moved inside the evidence; re-measure', v_first;
  end if;
  if coalesce((select payload_open from public.hr_tick_probe
                where channel = 'combat' order by opened_at desc limit 1), '') <> c_pin then
    raise exception 'ARM-P2: the newest combat probe is not on the pin — the live edge is not the measured one';
  end if;

  -- (P3) COHORT = ONE, RETURN RECENT, QUIET LONG ENOUGH TO BE WATCHED.
  --   P3a exactly ONE owned combat row (M4 stage 1: QA slot 1; widening is its
  --       own GO), and no live party hunt anywhere (a party cannot form from
  --       one owned character; the party path is cohort-bound by
  --       2026-10-14-world-tick-m4-party-horizon.sql (3a)).
  --   P3b its raw accrued_to inside 4 h: a real return AFTER the bar read
  --       bounds the boundary catch-up to <= 4 h (<= 160 flush windows).
  --   P3c ★ it IS the armed sentinel S2 will need, by the live stall body's
  --       own predicate over the same 2 h window: on combat since before the
  --       window, unpartied, admitted on the armed fence, NO non-tick combat
  --       ledger row in [now-2h, now) (F2b), not PARKED at its presence
  --       horizon, and with >= 1 h of horizon left (R + cap). Refuses BEFORE
  --       the write, naming the earliest arm time.
  select count(*) into v_n from public.hr_tick_ownership o where o.owned and o.channel = 'combat';
  if v_n <> 1 then
    raise exception 'ARM-P3: % owned combat rows (M4 stage 1 allows exactly 1; widening needs its own Security GO)', v_n;
  end if;
  if exists (select 1 from public.party_hunt h where h.ended_at is null) then
    raise exception 'ARM-P3: a party hunt is live — end it before combat arms (stage 1 is solo)';
  end if;
  if exists (select 1 from public.hr_tick_ownership o
               join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
              where o.owned and o.channel = 'combat' and ps.active_kind = 'combat'
                and (ps.accrued_to is null or ps.accrued_to < now() - interval '4 hours'))
     or not exists (select 1 from public.hr_tick_ownership o
                      join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
                     where o.owned and o.channel = 'combat' and ps.active_kind = 'combat') then
    raise exception 'ARM-P3: the owned combat character is off combat, or its raw accrued_to is older than 4 h — do a real return, then wait 2 h offline';
  end if;
  if not exists (
    select 1
      from public.hr_tick_ownership o
      join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
      join public.hr_return_anchor ra on ra.user_id = o.user_id and ra.slot = o.slot
     where o.owned and o.channel = 'combat' and ps.active_kind = 'combat'
       and ps.active_since <= now() - interval '2 hours'
       and not public.hr_partied(o.user_id, o.slot)
       and public.hr_tick_admit(true, ps.accrued_to, null) = 'admit'
       and ra.real_return_at + public.hr_offline_cap_ms(o.user_id, o.slot) * interval '1 millisecond'
           > now() + interval '1 hour'
       and not exists (
             select 1 from public.hr_tick_horizon_log hz
              where hz.user_id = o.user_id and hz.slot = o.slot and hz.anchor_at = ra.real_return_at)
       and not exists (
             select 1 from public.player_ledger pl
              where pl.user_id = o.user_id and pl.slot = o.slot
                and pl.at >= now() - interval '2 hours' and pl.at < now()
                and pl.kind = 'combat'
                and pl.meta->>'src' is distinct from 'tick')) then
    raise exception 'ARM-P3: the owned combat character cannot be the armed sentinel (F2b: a client combat settle inside the 2 h window, on combat < 2 h, partied, no anchor, or < 1 h of horizon left); earliest arm %',
      (select min(greatest(ps.active_since,
                           coalesce((select max(pl.at) from public.player_ledger pl
                                      where pl.user_id = o.user_id and pl.slot = o.slot and pl.kind = 'combat'
                                        and pl.meta->>'src' is distinct from 'tick'), ps.active_since))
                  + interval '2 hours')
         from public.hr_tick_ownership o
         join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
        where o.owned and o.channel = 'combat');
  end if;

  -- (P4) THE FENCE BODIES ARE THE REVIEWED ONES (checked by position, not marker):
  --   solo:   (8b) fenced_24h < (8c) fenced_cap < (8d) past_horizon < hr_apply
  --   party:  (3a) not_in_cohort, (3c) past_horizon drop, (8d) backstop before
  --           the fan-out's hr_apply
  --   start:  combat-armed gate AND cohort gate
  --   cap:    no partied short-circuit
  --   stall:  judges armed channels (armed_stalled), and is judging + healthy now.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_tick_settle'
         and position('fenced_24h' in p.prosrc) > 0
         and position('fenced_cap' in p.prosrc) > position('fenced_24h' in p.prosrc)
         and position('past_horizon' in p.prosrc) > position('fenced_cap' in p.prosrc)
         and position('public.hr_apply(' in p.prosrc) > position('past_horizon' in p.prosrc)) <> 1 then
    raise exception 'ARM-P4: hr_tick_settle lacks 8b/8c/8d in order (apply 2026-10-10-world-tick-presence-horizon.sql)';
  end if;
  if (select count(*) from pg_proc p
       where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure
         and position($q$'stop', 'not_in_cohort'$q$ in p.prosrc) > 0
         and position($q$then 'past_horizon'$q$ in p.prosrc) > position($q$'stop', 'not_in_cohort'$q$ in p.prosrc)
         and position($q$then 'no_return_anchor' else 'past_horizon' end$q$ in p.prosrc) > position($q$then 'past_horizon'$q$ in p.prosrc)
         and position('v_out := public.hr_apply(v_mu, v_ms' in p.prosrc)
             > position($q$then 'no_return_anchor' else 'past_horizon' end$q$ in p.prosrc)) <> 1 then
    raise exception 'ARM-P4: hr_party_tick_settle lacks the M4 cohort/horizon fences (apply 2026-10-14-world-tick-m4-party-horizon.sql)';
  end if;
  if (select count(*) from pg_proc p
       where p.oid = 'public.hr_party_hunt_start(integer,text,text,jsonb,uuid)'::regprocedure
         and position('hunt_channel_disarmed' in p.prosrc) > 0
         and position('hunt_not_in_cohort' in p.prosrc) > 0) <> 1 then
    raise exception 'ARM-P4: hr_party_hunt_start lacks the armed gate or the cohort gate';
  end if;
  if (select count(*) from pg_proc p
       where p.oid = 'public.hr_accrue_cap_ms(uuid,integer)'::regprocedure
         and position('hr_partied(p_user, p_slot) then return v_cap' in p.prosrc) = 0
         and position('or public.hr_partied(p_user, p_slot) then' in p.prosrc) > 0) <> 1 then
    raise exception 'ARM-P4: hr_accrue_cap_ms still short-circuits a partied character (apply 2026-10-14-world-tick-m4-party-horizon.sql)';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_tick_stall_status'
         and position('armed_stalled' in p.prosrc) > 0) <> 1 then
    raise exception 'ARM-P4: hr_tick_stall_status does not judge armed channels';
  end if;
  v_stall := public.hr_tick_stall_status(now(), 2, 30);
  if coalesce((v_stall->>'judged')::boolean, false) is not true
     or coalesce((v_stall->>'stalled')::boolean, true) is not false
     or not coalesce((v_stall->'watched_channels') ? 'combat', false) then
    raise exception 'ARM-P4: the combat shadow is not watched, not judging, or stalled: %', v_stall;
  end if;

  -- ── THE ARM ─────────────────────────────────────────────────────────────
  update public.hr_tick_config set armed_channels = array['gather','combat']::text[] where id;

  -- (S1) READ-BACK: gather and combat, nothing else.
  select * into v_cfg from public.hr_tick_config where id;
  if v_cfg.armed_channels <> array['gather','combat']::text[] then
    raise exception 'ARM-S1: armed_channels read back %', v_cfg.armed_channels;
  end if;
  -- (S2) THE ARMED COMBAT CHANNEL IS JUDGED (a sentinel exists) AND HEALTHY
  --      across the boundary (its shadow rows count until tick rows land);
  --      nothing armed reads stalled; combat is no longer a shadow channel.
  v_stall := public.hr_tick_stall_status(now(), 2, 30);
  select e into v_ent from jsonb_array_elements(coalesce(v_stall->'armed', '[]'::jsonb)) e
   where e->>'channel' = 'combat';
  if coalesce((v_stall->'watched_channels') ? 'combat', true)
     or coalesce((v_stall->>'stalled')::boolean, true) is not false
     or coalesce((v_stall->>'armed_stalled')::boolean, true) is not false then
    raise exception 'ARM-S2: combat still watched as shadow, or a stall after the arm: %', v_stall;
  end if;
  if v_ent is null
     or coalesce((v_ent->>'judged')::boolean, false) is not true
     or coalesce((v_ent->>'stalled')::boolean, true) is not false then
    raise exception 'ARM-S2: armed combat would go unjudged (no sentinel) or reads stalled: %', v_stall;
  end if;
  raise notice 'ARMED combat at % on payload %; stall %', now(), left(c_pin, 8), v_stall;
end $arm$;
