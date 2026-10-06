-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-07-world-tick-arm-gather.sql — M2: THE WORLD TICK PAYS GATHER.
--
-- STAGED, NOT APPLIED. Security-authored (veto role) from the runbook
-- docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md. The Coordinator applies
-- it ONLY after every runbook pre-arm step is green, via
--   node tools/apply-migration.mjs 2026-10-07-world-tick-arm-gather.sql
-- Never 00:00–00:10 UTC. Never in the same sitting as an edge deploy.
--
-- ONE CONFIG WRITE: armed_channels '{}' -> {gather}. Combat stays SHADOW.
-- Every precondition below is EXECUTED against the live rows and RAISES, so
-- the whole file rolls back (one transaction) if any one is false.
--
-- EXCLUDED FROM THE REPLAY CHAIN (tests/schema-apply-order.json `excluded`),
-- and that is the claim: arming is earned on THIS database's evidence (probe
-- rows on the pinned payload, a fresh cohort). A rebuilt or restored database
-- has no such evidence and must come back DISARMED and re-earn the arm.
-- The file refuses to apply anywhere the evidence is absent, by design
-- (precedent: 2026-08-12-clan-members-rls-drop.sql).
--
-- KILL (one statement, keeps the shadow measuring): the staged file
-- 2026-10-07-world-tick-disarm.sql, i.e.
--   update public.hr_tick_config set armed_channels = '{}' where id;
-- STOP EVERYTHING: update public.hr_tick_config set enabled = false where id;
-- ════════════════════════════════════════════════════════════════════════

do $arm$
declare
  c_pin   constant text := '6205e4e03090aa64c8ad000a9efea43a249722207970b390715382e59fded362';
  v_cfg   public.hr_tick_config%rowtype;
  v_n     int;
  v_ms    numeric;
  v_stall jsonb;
begin
  select * into v_cfg from public.hr_tick_config where id;
  if not found then raise exception 'ARM-0: no hr_tick_config row'; end if;

  -- (P1) CONFIG IS THE MEASURED ONE. Nothing armed yet, both channels driven,
  --      the 90 s flush the probes ran at (ruling 4.5: flush is its own write),
  --      no frame push (§7a: no inventory-bearing frame before the flip).
  if not v_cfg.enabled then raise exception 'ARM-P1: tick disabled'; end if;
  if v_cfg.armed_channels <> '{}'::text[] then
    raise exception 'ARM-P1: armed_channels is %, expected {} (already armed or partial)', v_cfg.armed_channels;
  end if;
  if not (v_cfg.channels @> array['gather','combat']::text[]) then
    raise exception 'ARM-P1: channels % lack gather+combat', v_cfg.channels;
  end if;
  if v_cfg.flush_seconds <> 90 or v_cfg.cadence_seconds <> 10 then
    raise exception 'ARM-P1: flush %/cadence % differ from the measured 90/10', v_cfg.flush_seconds, v_cfg.cadence_seconds;
  end if;
  if v_cfg.frame_push then raise exception 'ARM-P1: frame_push is on'; end if;

  -- (P2) PAYLOAD PIN. The evidence floor exists on the pinned payload, and no
  --      probe opened in the last 24 h on any other payload (= no edge deploy
  --      since the measurement). The evaluator (tools/world-tick-parity.mjs)
  --      is the BAR; this is only the floor it must have read.
  select count(*), coalesce(sum(extract(epoch from (span_to - span_from)) * 1000), 0)
    into v_n, v_ms
    from public.hr_tick_probe
   where channel = 'gather' and status = 'closed'
     and payload_open = c_pin and payload_close = c_pin;
  if v_n < 6 or v_ms < 24 * 3600 * 1000 then
    raise exception 'ARM-P2: % closed gather probes / % h on the pinned payload (need >= 6 / >= 24 h)',
      v_n, round(v_ms / 3600000.0, 2);
  end if;
  if exists (select 1 from public.hr_tick_probe
              where opened_at > now() - interval '24 hours'
                and (payload_open <> c_pin or coalesce(payload_close, c_pin) <> c_pin)) then
    raise exception 'ARM-P2: a probe in the last 24 h ran on another payload — the edge moved; re-measure';
  end if;

  -- (P3) COHORT, FRESH. The armed fence admits raw accrued_to < 24 h and the
  --      tick catches up one flush per fire with NO offline cap: a character
  --      whose raw watermark is 12-24 h old is paid the whole gap (measured
  --      2026-10-06 on the live probe snapshot: 6,755 ore vs accrue's capped
  --      3,900). Until the armed branch honours cap_ms, the arm is allowed only
  --      over a small owned cohort whose raw watermark was settled by a real
  --      return in the last 15 minutes.
  select count(*) into v_n from public.hr_tick_ownership o where o.owned and o.channel = 'gather';
  if v_n < 1 or v_n > 2 then
    raise exception 'ARM-P3: % owned gather rows (allowed 1..2 until the armed branch honours cap_ms)', v_n;
  end if;
  if exists (select 1 from public.hr_tick_ownership o
               join public.player_state ps on ps.user_id = o.user_id and ps.slot = o.slot
              where o.owned and o.channel = 'gather' and ps.active_kind = 'gather'
                and (ps.accrued_to is null or ps.accrued_to < now() - interval '15 minutes')) then
    raise exception 'ARM-P3: an owned gatherer''s raw accrued_to is older than 15 min — do the fresh real return first';
  end if;

  -- (P4) C1 IS THE LIVE FENCE BODY (its behaviour was executed by its own
  --      apply, g1); C2 IS JUDGING AND NOT STALLED, executed now.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_tick_settle'
         and position('fenced_24h' in p.prosrc) > 0) <> 1 then
    raise exception 'ARM-P4: hr_tick_settle is not the C1 body';
  end if;
  v_stall := public.hr_tick_stall_status(now(), 2, 30);
  if coalesce((v_stall->>'judged')::boolean, false) is not true
     or coalesce((v_stall->>'stalled')::boolean, true) is not false then
    raise exception 'ARM-P4: stall detector not judging or stalled: %', v_stall;
  end if;

  -- ── THE ARM ─────────────────────────────────────────────────────────────
  update public.hr_tick_config set armed_channels = array['gather']::text[] where id;

  -- (S1) READ-BACK: gather and only gather.
  select * into v_cfg from public.hr_tick_config where id;
  if v_cfg.armed_channels <> array['gather']::text[] then
    raise exception 'ARM-S1: armed_channels read back %', v_cfg.armed_channels;
  end if;
  -- (S2) C2 NOW WATCHES COMBAT ALONE, WITH A SENTINEL, AND IT IS HEALTHY.
  v_stall := public.hr_tick_stall_status(now(), 2, 30);
  if (v_stall->'watched_channels') <> '["combat"]'::jsonb
     or coalesce((v_stall->>'judged')::boolean, false) is not true
     or coalesce((v_stall->>'stalled')::boolean, true) is not false then
    raise exception 'ARM-S2: combat shadow would go unwatched or stalled after the arm: %', v_stall;
  end if;
  raise notice 'ARMED gather at % on payload %; stall %', now(), left(c_pin, 8), v_stall;
end $arm$;
