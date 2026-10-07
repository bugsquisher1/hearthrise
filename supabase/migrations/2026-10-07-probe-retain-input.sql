-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-07-probe-retain-input.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- THE PROBE KEEPS WHAT ITS REPLAY NEEDS. Unblocks combat M4.
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────────
-- The Security combat-bar ruling (docs/planning/SEC_VIGOUR_LINE_SPLIT_2026-10-06.md
-- #7) judges every combat probe against its SEEDED REPLAY: R replicas of the
-- one span and the shipped chain from the STORED input, plus a reproduction
-- of the stored one-span result from that input and the probe's own seed.
-- 2026-10-06-world-tick-parity-probe.sql NULLs `input` at close, and the
-- one-span seed is hr_seed's (a server secret the reader never sees), so
-- tools/world-tick-parity.mjs answers `replay unavailable: input_not_retained`
-- on every closed combat probe (all 4 on production, read 2026-10-06) and the
-- combat read is INSUFFICIENT forever.
--
-- ── THE FIX — DB ONLY, NO EDGE CHANGE ──────────────────────────────────────
--   1. CLOSE KEEPS `input`. The snapshot at span_from (rule 4) survives the
--      close instead of being NULLed. A VOID still NULLs it (a void is a
--      discard; nothing replays it).
--   2. CLOSE STORES `seed` — the ONE-SPAN seed, derived HERE, by the database,
--      with the exact expression the edge used to draw it:
--        (hr_seed(user, slot, 'accrue:' || (to_jsonb(span_from) #>> '{}'))
--           & 4294967295)::bigint
--      i.e. tick.js SEED_LABEL_EXPR over the very string hr_tick_probe_fetch
--      handed the edge (`to_jsonb(span_from) #>> '{}'`), masked as seedLadder
--      masks it. The edge sends nothing new: no seed crosses the wire, so no
--      caller can plant one, and a probe whose stored result does NOT
--      reproduce from (input, seed) is a visible FAIL in the evaluator, never
--      a silent pass. The edge payload is untouched (EDGE FREEZE respected).
--   3. RETENTION of the replay material, in hr_tick_probe_prune (below).
--
-- ── WHY STORING THE SEED VALUE IS SAFE ─────────────────────────────────────
-- It is ONE 32-bit draw of hr_seed for ONE label: the start of a span that is
-- already closed. It reproduces that span's stream and nothing else — it is
-- not the hr_seed secret, it does not derive another label's seed, and the
-- label it belongs to is a PAST shadow watermark. And no client role can
-- read it at all: hr_tick_probe is RLS-forced with no policy and NO table or
-- column privilege for anon / authenticated / service_role / hr_engine /
-- hr_tick (§5 p1c + p1g assert it per COLUMN). The only readers are the
-- owner and the operator's management-endpoint SELECT — roles that can
-- already read hr_server_secrets itself.
--
-- ── RETENTION: N = 4 DAYS, M = 30 PER (user, slot, channel) ────────────────
-- A closed probe keeps input + seed while BOTH hold: closed within the last
-- 4 days, and among its character-channel's 30 most recent closed probes.
-- After that hr_tick_probe_prune NULLs both and stamps `input_trimmed_at`;
-- the row (span, versions, payloads, result) stays to hr_tick_shadow's 14 days.
--   * N = 4 days = the combat arming bar's 48 h window TWICE: a complete 48 h
--     combat read stays fully replayable for a further 48 h after its last
--     probe closes — a daily cut plus a re-read/dispute. The gather bar
--     (≥ 24 h) needs no replay at all; it reads result vs windows only.
--   * M = 30 = five days of the 6/day cadence, so at steady state N binds and
--     M is only the byte ceiling that holds if the cadence ever changes
--     (MAX_PROBES_PER_FIRE bursts, a shorter PROBE_SPAN_MS).
--   * The evaluator treats a TRIMMED combat probe as out of the read
--     (`retention_trimmed`, counted and printed like off-payload), never as a
--     missing replay: retention is by age/count, independent of outcome, so
--     it cannot select which probes are judged. A closed probe with no input
--     and NO trim stamp (the 4 pre-retention rows) still reads
--     `input_not_retained` — honest, and it ages out with its payload.
--
-- ── COST AT 100x (1,000 rostered shadow characters, two channels) ──────────
--   Measured on production 2026-10-06 (SELECT-only): an input is 2,129 B
--   (combat) / 3,019 B (gather) as text, 1,726 / 2,291 B stored
--   (pg_column_size). 12,000 closed probes/day fleet-wide; retained ≤ 4 days
--   → ≤ 48,000 retained inputs → ~96 MB at the measured size, ≤ ~390 MB at
--   the 8 KB a late-game inventory reaches (65,536 B CHECK unchanged). The
--   seed is 8 B/row. Was ~85 MB total; the 0.2–0.7 GB estimate for "keep
--   everything 14 days" is what N cuts down. Prune: one window-function pass
--   over ≤ 48k retained rows per hour, on a partial index.
--
-- ── WHAT THIS FILE TOUCHES ─────────────────────────────────────────────────
--   hr_tick_probe                + seed bigint, + input_trimmed_at timestamptz,
--                                  shape CHECK restated, + seed range CHECK,
--                                  + partial index on retained closed rows
--   hr_tick_probe_commit(...)    RESTATED (last toucher). Two changes in the
--                                  close branch: input kept, seed derived.
--                                  Signature, grants, refusals unchanged.
--   hr_tick_probe_prune(int)     RESTATED. + the retention trim; the 14-day
--                                  row delete unchanged. Returns trimmed+deleted.
--   hr_tick_probe_fetch          NOT touched.
--   hr_assert_grant_hygiene      NOT touched: both signatures are unchanged, so
--                                  c_engine_allow already names them.
--   No grant moves. No other table is read or written.
--
-- ── CONCURRENCY AND IDEMPOTENCY ────────────────────────────────────────────
-- Unchanged from the probe: the commit's advisory lock on (user, slot,
-- channel), the open partial unique index, a replayed close is a no-op (the
-- row is no longer open, so its seed and input cannot be rewritten). The
-- prune touches only rows that are closed and already past both bounds; a
-- commit never moves a closed row, so the two cannot race on one row.
--
-- ── REVERSIBLE ─────────────────────────────────────────────────────────────
-- Re-apply 2026-10-06-world-tick-parity-probe.sql §3/§4 (the previous bodies),
-- then `update public.hr_tick_probe set input = null, seed = null where
-- status <> 'open'`, drop the new CHECKs/index/columns and restore the old
-- shape CHECK. Nothing outside hr_tick_probe moves. The edge needs no change
-- in either direction.
--
-- ── AFTER APPLYING ─────────────────────────────────────────────────────────
-- live-hash-drift: the probe functions are not tracked names (2026-10-06 note);
-- expect no row — report what it wants if it does. restore-census: no new
-- table; hr_tick_probe stays operational + player_value_exempt.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_tick_probe') is null then
    raise exception 'PRECONDITION: hr_tick_probe is absent — apply 2026-10-06-world-tick-parity-probe.sql first';
  end if;
  if to_regprocedure('public.hr_tick_probe_commit(text,uuid,int,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb)') is null
     or to_regprocedure('public.hr_tick_probe_fetch(text,uuid,int,text)') is null
     or to_regprocedure('public.hr_tick_probe_prune(int)') is null then
    raise exception 'PRECONDITION: the probe trio is absent — apply 2026-10-06-world-tick-parity-probe.sql first';
  end if;
  if to_regprocedure('public.hr_seed(uuid,integer,text)') is null then
    raise exception 'PRECONDITION: hr_seed(uuid,integer,text) is absent — the one-span seed is derived from it';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'hr_engine') then
    raise exception 'PRECONDITION: hr_engine does not exist';
  end if;
end $$;

-- ── §1 THE TABLE: two columns, the shape restated ─────────────────────────
alter table public.hr_tick_probe add column if not exists seed bigint;
alter table public.hr_tick_probe add column if not exists input_trimmed_at timestamptz;

comment on column public.hr_tick_probe.seed is
  'The one-span seed: (hr_seed(user, slot, ''accrue:'' || span_from as Postgres renders it) & 4294967295), '
  'derived by hr_tick_probe_commit at CLOSE. Reproduces this span only. No client or engine role can read it.';
comment on column public.hr_tick_probe.input_trimmed_at is
  'Set by hr_tick_probe_prune when it NULLs input + seed past retention (4 days / 30 per character-channel).';

-- The shape: an OPEN probe has input and no seed; a CLOSED probe has input
-- and seed together (retained) or neither (trimmed, or closed before this
-- file); a VOID has neither. A trim stamp implies the material is gone.
alter table public.hr_tick_probe drop constraint if exists hr_tick_probe_shape_ck;
alter table public.hr_tick_probe add constraint hr_tick_probe_shape_ck check (
     (status = 'open'   and input is not null and seed is null and result is null and span_to is null
                        and input_trimmed_at is null)
  or (status = 'closed' and result is not null and span_to is not null
                        and version_close is not null and payload_close is not null
                        and closed_at is not null
                        and (input is null) = (seed is null)
                        and (input_trimmed_at is null or input is null))
  or (status = 'void'   and input is null and seed is null and void_reason is not null
                        and input_trimmed_at is null));
alter table public.hr_tick_probe drop constraint if exists hr_tick_probe_seed_ck;
alter table public.hr_tick_probe add constraint hr_tick_probe_seed_ck check (
  seed is null or (seed >= 0 and seed <= 4294967295));

create index if not exists hr_tick_probe_retained_idx
  on public.hr_tick_probe (user_id, slot, channel, span_from desc)
  where status = 'closed' and input is not null;

-- ── §2 hr_tick_probe_commit — RESTATED; the close keeps input, derives seed ─
create or replace function public.hr_tick_probe_commit(
  p_holder       text,
  p_user         uuid,
  p_slot         int,
  p_channel      text,
  p_window_from  timestamptz,
  p_window_to    timestamptz,
  p_payload      text,
  p_close_id     bigint,
  p_close_result jsonb,
  p_open_input   jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c_min_span   constant interval := interval '4 hours';
  c_max_span   constant interval := interval '6 hours';
  c_input_max  constant int      := 65536;
  c_result_max constant int      := 16384;
  v_role   text;
  v_cfg    public.hr_tick_config%rowtype;
  v_own    public.hr_tick_ownership%rowtype;
  v_ver    bigint;
  v_probe  public.hr_tick_probe%rowtype;
  v_closed bigint;
  v_void   text;
  v_voided int := 0;
  v_n      int;
  v_opened bigint;
begin
  -- (0) IDENTITY.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_tick_probe_commit: not callable by %', v_role using errcode = '42501';
  end if;
  -- (1) THE KILL SWITCH.
  select * into v_cfg from public.hr_tick_config where id;
  if not found or not v_cfg.enabled then
    return jsonb_build_object('ok', false, 'error', 'tick_disabled');
  end if;
  -- (2) ARGUMENTS — bounded and shaped before anything is read.
  if p_holder is null or p_user is null or p_slot is null or p_channel is null
     or p_window_from is null or p_window_to is null or p_payload is null then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if p_channel not in ('combat', 'gather') then
    return jsonb_build_object('ok', false, 'error', 'channel_not_probed');
  end if;
  if p_payload !~ '^([0-9a-f]{64}|unpacked)$' then
    return jsonb_build_object('ok', false, 'error', 'bad_payload');
  end if;
  if p_window_to <= p_window_from then
    return jsonb_build_object('ok', false, 'error', 'bad_window');
  end if;
  if p_open_input is not null and (jsonb_typeof(p_open_input) <> 'object'
       or octet_length(p_open_input::text) > c_input_max) then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  if p_close_result is not null and (jsonb_typeof(p_close_result) <> 'object'
       or octet_length(p_close_result::text) > c_result_max) then
    return jsonb_build_object('ok', false, 'error', 'bad_result');
  end if;
  if p_close_id is null and p_open_input is null then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_commit');
  end if;

  -- (3) SERIALISE THIS CHARACTER'S PROBE ROWS — and nothing else. An advisory
  --     lock, transaction-scoped, never taken by hr_tick_settle: no row lock on
  --     player_state or hr_tick_ownership, because a lock is a tuple write.
  perform pg_advisory_xact_lock(
    hashtextextended('hr_tick_probe:' || p_user::text || ':' || p_slot::text || ':' || p_channel, 0));

  -- (4) THE LEASE, as the fence checks it.
  select * into v_own from public.hr_tick_ownership
   where user_id = p_user and slot = p_slot and channel = p_channel;
  if not found or not v_own.owned then
    return jsonb_build_object('ok', false, 'error', 'not_tick_owned');
  end if;
  if v_own.lease_holder is distinct from p_holder
     or v_own.lease_until is null or v_own.lease_until <= now() then
    return jsonb_build_object('ok', false, 'error', 'no_lease');
  end if;

  -- (5) THE ANCHOR: a JOURNALLED shadow window at the CHAIN HEAD. The caller
  --     cannot name a span the shadow chain did not actually reach, and an
  --     armed channel (shadow mark cleared, no shadow row) cannot reach here.
  if v_own.shadow_accrued_to is distinct from p_window_to then
    return jsonb_build_object('ok', false, 'error', 'not_chain_head',
      'chain_head', v_own.shadow_accrued_to);
  end if;
  select s.version into v_ver from public.hr_tick_shadow s
   where s.user_id = p_user and s.slot = p_slot and s.channel = p_channel
     and s.window_from = p_window_from and s.window_to = p_window_to
   order by s.id desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_shadow_window');
  end if;

  -- (6) CLOSE (or void) the named open probe.
  --     A CLOSE KEEPS THE INPUT (the snapshot at span_from, rule 4) and stores
  --     the ONE-SPAN SEED beside it, derived here with tick.js SEED_LABEL_EXPR
  --     over the string hr_tick_probe_fetch handed the edge, masked as the
  --     edge masks it — so tools/world-tick-parity.mjs can replay the probe
  --     and reproduce its stored result without ever reading hr_seed's secret.
  --     The seed is never a caller value. A VOID keeps neither.
  if p_close_id is not null then
    select * into v_probe from public.hr_tick_probe
     where id = p_close_id and user_id = p_user and slot = p_slot and channel = p_channel
       and status = 'open';
    if found then
      v_void := case
        when p_close_result is null then 'no_result'
        when p_window_to - v_probe.span_from < c_min_span
          or p_window_to - v_probe.span_from > c_max_span then 'span_out_of_bounds'
        else null end;
      if v_void is null then
        update public.hr_tick_probe
           set status = 'closed', span_to = p_window_to, result = p_close_result,
               version_close = v_ver, payload_close = p_payload,
               seed = (public.hr_seed(p_user, p_slot,
                         'accrue:' || (to_jsonb(v_probe.span_from) #>> '{}')) & 4294967295)::bigint,
               closed_at = now()
         where id = v_probe.id;
        v_closed := v_probe.id;
      else
        update public.hr_tick_probe
           set status = 'void', void_reason = v_void, input = null, seed = null, closed_at = now()
         where id = v_probe.id;
        v_voided := v_voided + 1;
      end if;
    end if;
  end if;

  -- (7) OPEN. Anything still open for this character is superseded first — a
  --     probe whose close was missed can never close honestly, and the
  --     evaluator counts the void as a discard rather than losing it.
  if p_open_input is not null then
    update public.hr_tick_probe
       set status = 'void', void_reason = 'superseded', input = null, seed = null, closed_at = now()
     where user_id = p_user and slot = p_slot and channel = p_channel and status = 'open';
    get diagnostics v_n = row_count;
    v_voided := v_voided + v_n;
    insert into public.hr_tick_probe
      (user_id, slot, channel, holder, status, span_from, base_version, payload_open, input)
    values
      (p_user, p_slot, p_channel, p_holder, 'open', p_window_from, v_ver, p_payload, p_open_input)
    on conflict (user_id, slot, channel, span_from) do nothing
    returning id into v_opened;
  end if;

  return jsonb_build_object('ok', true, 'closed', v_closed, 'voided', v_voided,
                            'opened', v_opened);
end $$;

-- ── §3 hr_tick_probe_prune — RESTATED; the retention trim, then the rows ──
-- (1) the REPLAY MATERIAL (input + seed) of a closed probe, past 4 days or
--     past its character-channel's 30 most recent closed probes: NULLed and
--     stamped, the row kept. (2) the ROW, at hr_tick_shadow's 14 days, as
--     before: a probe is unreadable once its windows are pruned.
-- Bounded per call by p_limit in each step. Returns rows trimmed + deleted.
create or replace function public.hr_tick_probe_prune(p_limit int default 20000)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  c_keep_for constant interval := interval '4 days';
  c_keep_per constant int      := 30;
  v_lim bigint := greatest(1, least(coalesce(p_limit, 20000), 200000));
  v_t   bigint;
  v_n   bigint;
begin
  with ranked as (
    select id, closed_at,
           row_number() over (partition by user_id, slot, channel
                              order by span_from desc, id desc) as rn
      from public.hr_tick_probe
     where status = 'closed' and input is not null
  ), doomed as (
    select id from ranked
     where closed_at < now() - c_keep_for or rn > c_keep_per
     order by id limit v_lim
  )
  update public.hr_tick_probe p
     set input = null, seed = null, input_trimmed_at = now()
    from doomed d where p.id = d.id;
  get diagnostics v_t = row_count;

  with doomed as (
    select id from public.hr_tick_probe
     where opened_at < now() - interval '14 days'
     order by id limit v_lim
  )
  delete from public.hr_tick_probe p using doomed d where p.id = d.id;
  get diagnostics v_n = row_count;
  return v_t + v_n;
end $$;

-- ── §4 GRANTS — unchanged, restated (create or replace keeps the ACL; this
--    makes the file stand alone and re-apply identically) ──────────────────
revoke execute on function public.hr_tick_probe_commit(text, uuid, int, text, timestamptz, timestamptz, text, bigint, jsonb, jsonb) from public;
revoke execute on function public.hr_tick_probe_prune(int) from public;
revoke execute on function public.hr_tick_probe_commit(text, uuid, int, text, timestamptz, timestamptz, text, bigint, jsonb, jsonb) from anon, authenticated, service_role;
revoke execute on function public.hr_tick_probe_prune(int) from anon, authenticated, service_role, hr_engine;
do $$
begin
  execute 'revoke all on public.hr_tick_probe from public, anon, authenticated, service_role, hr_engine';
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_tick_probe_commit(text, uuid, int, text, timestamptz, timestamptz, text, bigint, jsonb, jsonb) from hr_tick';
    execute 'revoke execute on function public.hr_tick_probe_prune(int) from hr_tick';
    execute 'revoke all on public.hr_tick_probe from hr_tick';
  end if;
end $$;
grant execute on function public.hr_tick_probe_commit(text, uuid, int, text, timestamptz, timestamptz, text, bigint, jsonb, jsonb) to hr_engine;

-- ── §5 SELF-CHECK — EXECUTED (CLAUDE.md §4) ───────────────────────────────
-- PROBE ROWS ONLY: every row this block writes is under `v_u`, a uuid
-- gen_random_uuid() cannot mint, and the whole block rolls back through the
-- HR1007_ROLLBACK_OK sentinel. It runs as the APPLYING role, which the
-- functions' identity check admits; the hr_engine path is proved by
-- tests/world-tick-parity-probe.mjs on the replayed chain (PP-9).
do $$
declare
  v_u      constant uuid := '00000000-0000-4000-8000-0000000f1007';
  v_h      constant text := 'selfcheck-probe-retain';
  v_in     constant jsonb := '{"accruedToMs":1,"skills":{"woodcutting":7}}'::jsonb;
  v_t0     timestamptz := date_trunc('second', now()) - interval '5 hours';
  v_t1     timestamptz;
  v_t2     timestamptz;
  v_r      jsonb;
  v_n      bigint;
  v_id     bigint;
  v_ps     text;
  v_ps2    text;
  v_ow     text;
  v_ow2    text;
  v_moved  text;
  v_role   text;
  v_bad    text;
  v_col    text;
  v_row    public.hr_tick_probe%rowtype;
  v_want   bigint;
begin
  -- ── p1 THE SURFACE: RLS forced, no policy, no table, COLUMN or sequence
  --    privilege for any client or engine role — the seed and the retained
  --    input are readable by no role a request can reach.
  if not (select relrowsecurity and relforcerowsecurity from pg_class
           where oid = 'public.hr_tick_probe'::regclass) then
    raise exception 'p1a: hr_tick_probe does not have RLS enabled AND forced';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.hr_tick_probe'::regclass) then
    raise exception 'p1b: hr_tick_probe has a policy — it must have none';
  end if;
  foreach v_role in array array['public','anon','authenticated','service_role','hr_engine','hr_tick'] loop
    if v_role <> 'public' and not exists (select 1 from pg_roles where rolname = v_role) then continue; end if;
    if has_table_privilege(v_role, 'public.hr_tick_probe', 'select,insert,update,delete,truncate,references,trigger')
       or has_sequence_privilege(v_role, 'public.hr_tick_probe_id_seq', 'usage,select,update') then
      raise exception 'p1c: % holds a privilege on hr_tick_probe or its sequence', v_role;
    end if;
    foreach v_col in array array['seed', 'input', 'input_trimmed_at'] loop
      if has_column_privilege(v_role, 'public.hr_tick_probe', v_col, 'select,insert,update,references') then
        raise exception 'p1g: % holds a column privilege on hr_tick_probe.% — the seed must reach no client', v_role, v_col;
      end if;
    end loop;
    if has_function_privilege(v_role, 'public.hr_tick_probe_prune(int)', 'execute') then
      raise exception 'p1d: % can execute hr_tick_probe_prune', v_role;
    end if;
    if v_role <> 'hr_engine'
       and (has_function_privilege(v_role, 'public.hr_tick_probe_fetch(text,uuid,int,text)', 'execute')
         or has_function_privilege(v_role,
              'public.hr_tick_probe_commit(text,uuid,int,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb)', 'execute')) then
      raise exception 'p1e: % can execute a probe function — only hr_engine may', v_role;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_tick_probe_fetch(text,uuid,int,text)', 'execute')
     or not has_function_privilege('hr_engine',
          'public.hr_tick_probe_commit(text,uuid,int,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb)', 'execute') then
    raise exception 'p1f: hr_engine cannot execute the probe pair — the edge could never write a probe';
  end if;
  --    hr_seed itself stays engine-only: storing one of its draws must not be
  --    read as license to widen the function.
  foreach v_role in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_role, 'public.hr_seed(uuid,integer,text)', 'execute') then
      raise exception 'p1h: % can execute hr_seed', v_role;
    end if;
  end loop;

  -- ── p6 EXCLUSION BY TABLE IDENTITY, read off the catalogue: no function
  --    body in public other than the probe trio mentions hr_tick_probe.
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname not in ('hr_tick_probe_fetch', 'hr_tick_probe_commit', 'hr_tick_probe_prune',
                           'hr_assert_grant_hygiene')
     and p.prosrc ~ '\mhr_tick_probe\M';
  if v_bad is not null then
    raise exception 'p6: function(s) outside the probe pair read hr_tick_probe: %', v_bad;
  end if;
  --    …and the probe trio's own DML names hr_tick_probe and nothing else.
  select string_agg(m[2], ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join lateral regexp_matches(p.prosrc,
          '(insert\s+into|update|delete\s+from)\s+(?:public\.)?([a-z_][a-z0-9_]*)', 'gi') m
   where n.nspname = 'public'
     and p.proname in ('hr_tick_probe_fetch', 'hr_tick_probe_commit', 'hr_tick_probe_prune')
     and lower(m[2]) <> 'hr_tick_probe';
  if v_bad is not null then
    raise exception 'p6b: a probe function writes a table other than hr_tick_probe: %', v_bad;
  end if;
  if (select provolatile from pg_proc where oid = 'public.hr_tick_probe_fetch(text,uuid,int,text)'::regprocedure) <> 's' then
    raise exception 'p6c: hr_tick_probe_fetch is not STABLE — the read half may not write';
  end if;

  begin
    -- ── A PROBE CHARACTER WITH A SHADOW CHAIN HEAD ────────────────────────
    update public.hr_tick_config set enabled = true where id;
    insert into auth.users (id) values (v_u) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
    values (v_u, 0, 0, 0, 10, 10, 3, v_t0)
    on conflict (user_id, slot) do update set version = 3, accrued_to = v_t0;
    delete from public.hr_tick_ownership where user_id = v_u;
    v_t1 := v_t0 + interval '90 seconds';
    insert into public.hr_tick_ownership (user_id, slot, channel, owned, lease_holder, lease_until,
                                          shadow_accrued_to)
    values (v_u, 0, 'gather', true, v_h, now() + interval '5 minutes', v_t1);
    insert into public.hr_tick_shadow (user_id, slot, channel, holder, window_from, window_to,
                                       version, intent_id, delta)
    values (v_u, 0, 'gather', v_h, v_t0, v_t1, 3, gen_random_uuid(), '{}'::jsonb);

    -- ── p2 THE REFUSALS, each by name, each writing nothing.
    v_r := public.hr_tick_probe_commit('someone-else', v_u, 0, 'gather', v_t0, v_t1,
             'unpacked', null, null, '{"k":1}'::jsonb);
    if v_r->>'error' is distinct from 'no_lease' then raise exception 'p2a: a foreign holder was not refused: %', v_r; end if;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t0 - interval '90 seconds', v_t0,
             'unpacked', null, null, '{"k":1}'::jsonb);
    if v_r->>'error' is distinct from 'not_chain_head' then raise exception 'p2b: a non-head window was not refused: %', v_r; end if;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'combat', v_t0, v_t1,
             'unpacked', null, null, '{"k":1}'::jsonb);
    if v_r->>'error' is distinct from 'not_tick_owned' then raise exception 'p2c: an unowned channel was not refused: %', v_r; end if;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t0, v_t1,
             'not-a-hash', null, null, '{"k":1}'::jsonb);
    if v_r->>'error' is distinct from 'bad_payload' then raise exception 'p2d: a forged payload stamp was not refused: %', v_r; end if;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t0, v_t1,
             'unpacked', null, null, jsonb_build_object('pad', repeat('x', 70000)));
    if v_r->>'error' is distinct from 'bad_input' then raise exception 'p2e: an oversize input was not refused: %', v_r; end if;
    select count(*) into v_n from public.hr_tick_probe where user_id = v_u;
    if v_n <> 0 then raise exception 'p2f: a refusal wrote % probe row(s)', v_n; end if;

    -- ── p3 ★ OPEN + CLOSE WRITE hr_tick_probe AND NOTHING ELSE ★
    select md5(ps::text) into v_ps from public.player_state ps where ps.user_id = v_u and ps.slot = 0;
    select md5(o::text) into v_ow from public.hr_tick_ownership o where o.user_id = v_u and o.channel = 'gather';
    create temp table hr__probe_stat_before on commit drop as
      select relid, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_xact_user_tables;

    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t0, v_t1, 'unpacked', null, null, v_in);
    v_id := (v_r->>'opened')::bigint;
    if v_id is null then raise exception 'p3a: the open was not written: %', v_r; end if;
    select string_agg(c.relname, ', ') into v_moved
      from pg_stat_xact_user_tables a
      join pg_class c on c.oid = a.relid
      left join hr__probe_stat_before b on b.relid = a.relid
     where c.relname not in ('hr_tick_probe', 'hr__probe_stat_before')
       and (a.n_tup_ins, a.n_tup_upd, a.n_tup_del)
           is distinct from (coalesce(b.n_tup_ins, 0), coalesce(b.n_tup_upd, 0), coalesce(b.n_tup_del, 0));
    if v_moved is not null then
      raise exception 'p3a2: the probe OPEN wrote outside hr_tick_probe: %', v_moved;
    end if;
    if (select seed from public.hr_tick_probe where id = v_id) is not null then
      raise exception 'p3a3: an OPEN probe carries a seed — it is derived at close only';
    end if;
    v_t2 := v_t0 + interval '4 hours 30 minutes';
    update public.hr_tick_ownership set shadow_accrued_to = v_t2
     where user_id = v_u and slot = 0 and channel = 'gather';
    insert into public.hr_tick_shadow (user_id, slot, channel, holder, window_from, window_to,
                                       version, intent_id, delta)
    values (v_u, 0, 'gather', v_h, v_t2 - interval '90 seconds', v_t2, 3, gen_random_uuid(), '{}'::jsonb);
    select md5(o::text) into v_ow from public.hr_tick_ownership o where o.user_id = v_u and o.channel = 'gather';
    drop table hr__probe_stat_before;
    create temp table hr__probe_stat_before on commit drop as
      select relid, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_xact_user_tables;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', v_id, '{"ticks":5,"qty":5}'::jsonb, null);
    if (v_r->>'closed')::bigint is distinct from v_id then
      raise exception 'p3c: the close did not land: %', v_r;
    end if;
    select string_agg(c.relname || ' +' || (a.n_tup_ins - coalesce(b.n_tup_ins, 0))
                      || '/~' || (a.n_tup_upd - coalesce(b.n_tup_upd, 0))
                      || '/-' || (a.n_tup_del - coalesce(b.n_tup_del, 0)), ', ')
      into v_moved
      from pg_stat_xact_user_tables a
      join pg_class c on c.oid = a.relid
      left join hr__probe_stat_before b on b.relid = a.relid
     where c.relname not in ('hr_tick_probe', 'hr__probe_stat_before')
       and (a.n_tup_ins, a.n_tup_upd, a.n_tup_del)
           is distinct from (coalesce(b.n_tup_ins, 0), coalesce(b.n_tup_upd, 0), coalesce(b.n_tup_del, 0));
    if v_moved is not null then
      raise exception 'p3d: the probe CLOSE wrote outside hr_tick_probe: %', v_moved;
    end if;
    select md5(ps::text) into v_ps2 from public.player_state ps where ps.user_id = v_u and ps.slot = 0;
    select md5(o::text) into v_ow2 from public.hr_tick_ownership o where o.user_id = v_u and o.channel = 'gather';
    if v_ps2 is distinct from v_ps then raise exception 'p3e: the probe moved the player_state row'; end if;
    if v_ow2 is distinct from v_ow then
      raise exception 'p3f: the probe moved the hr_tick_ownership row (shadow_accrued_to / shadow_state / lease)';
    end if;

    -- ── p3g ★ THE INPUT AND THE SEED SURVIVE THE CLOSE ★
    --    The input is the bytes stored at OPEN; the seed is hr_seed's draw for
    --    the span-start label exactly as the edge drew it (SEED_LABEL_EXPR over
    --    the fetch's rendering, masked to 32 bits).
    select * into v_row from public.hr_tick_probe where id = v_id;
    select (public.hr_seed(v_u, 0, 'accrue:' || (to_jsonb(l.ts::timestamptz) #>> '{}')) & 4294967295)::bigint
      into v_want
      from (select to_jsonb(v_row.span_from) #>> '{}' as ts) l;
    if v_row.status <> 'closed' or v_row.span_to is distinct from v_t2 or v_row.version_close <> 3 then
      raise exception 'p3g: the closed row is not the shape the evaluator reads';
    end if;
    if v_row.input is distinct from v_in then
      raise exception 'p3h: the close did not keep the input stored at open (got %)', v_row.input;
    end if;
    if v_row.seed is null or v_row.seed is distinct from v_want then
      raise exception 'p3i: the stored seed % is not the span-start hr_seed draw %', v_row.seed, v_want;
    end if;

    -- ── p4 IDEMPOTENT: the same close again is a no-op — the result, the
    --      input and the seed are all unmoved.
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', v_id, '{"ticks":9}'::jsonb, null);
    if v_r->>'closed' is not null or (v_r->>'voided')::int <> 0 then
      raise exception 'p4a: a replayed close moved a closed probe: %', v_r;
    end if;
    if (select result->>'ticks' || ':' || seed::text || ':' || md5(input::text)
          from public.hr_tick_probe where id = v_id)
       is distinct from ('5:' || v_want::text || ':' || md5(v_in::text)) then
      raise exception 'p4b: a replayed close rewrote the stored result, input or seed';
    end if;

    -- ── p5 A SPAN OUTSIDE [4 h, 6 h] VOIDS, NEVER CLOSES, and keeps nothing.
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', null, null, '{"k":2}'::jsonb);
    v_n := (v_r->>'opened')::bigint;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', v_n, '{"ticks":1}'::jsonb, null);
    if (select status || ':' || coalesce(void_reason, '') || ':' || (input is null)::text || ':' || (seed is null)::text
          from public.hr_tick_probe where id = v_n)
       <> 'void:span_out_of_bounds:true:true' then
      raise exception 'p5a: a one-window span was not voided span_out_of_bounds with no input/seed: %', v_r;
    end if;

    -- ── p9 ★ RETENTION ★ (a) a closed probe within 4 days and within its 30
    --    most recent keeps both; (b) past 4 days, prune trims input + seed,
    --    stamps the row and KEEPS it (result, span, versions); (c) the 31st most
    --    recent closed probe of one character-channel is trimmed even when
    --    young; (d) a row past 14 days is deleted as before.
    perform public.hr_tick_probe_prune(200000);
    if (select input is null or seed is null from public.hr_tick_probe where id = v_id) then
      raise exception 'p9a: prune trimmed a probe closed minutes ago';
    end if;
    update public.hr_tick_probe set closed_at = now() - interval '4 days 1 minute' where id = v_id;
    perform public.hr_tick_probe_prune(200000);
    select * into v_row from public.hr_tick_probe where id = v_id;
    if not found then raise exception 'p9b: prune deleted a 4-day-old probe row — it trims, the row lives 14 days'; end if;
    if v_row.input is not null or v_row.seed is not null or v_row.input_trimmed_at is null
       or v_row.result is null or v_row.status <> 'closed' then
      raise exception 'p9b: past 4 days the input/seed were not trimmed and stamped (input % seed % stamp %)',
        v_row.input is not null, v_row.seed, v_row.input_trimmed_at;
    end if;
    -- (c) 31 young retained closed probes on one character-channel.
    insert into public.hr_tick_probe (user_id, slot, channel, holder, status, span_from, span_to,
                                      base_version, version_close, payload_open, payload_close,
                                      input, seed, result, closed_at)
    select v_u, 1, 'combat', v_h, 'closed',
           v_t0 - make_interval(hours => 5 * g), v_t0 - make_interval(hours => 5 * g) + interval '4 hours 1 minute',
           3, 3, 'unpacked', 'unpacked', v_in, g, '{"ticks":1}'::jsonb, now()
      from generate_series(1, 31) g;
    perform public.hr_tick_probe_prune(200000);
    select count(*) filter (where input is not null), min(seed) filter (where input is null)
      into v_n, v_want
      from public.hr_tick_probe where user_id = v_u and slot = 1 and channel = 'combat';
    if v_n <> 30 or v_want is not null then
      raise exception 'p9c: the per-character cap kept % of 31 (want 30)', v_n;
    end if;
    if (select seed from public.hr_tick_probe where user_id = v_u and slot = 1 and channel = 'combat'
          and input is null) is not null
       or (select count(*) from public.hr_tick_probe where user_id = v_u and slot = 1 and channel = 'combat'
             and input is null and seed is null and input_trimmed_at is not null
             and span_from = v_t0 - interval '155 hours') <> 1 then
      raise exception 'p9c2: the cap did not trim exactly the OLDEST span';
    end if;
    -- (d) the 14-day row delete is unchanged.
    update public.hr_tick_probe set opened_at = now() - interval '15 days' where id = v_id;
    perform public.hr_tick_probe_prune(200000);
    if exists (select 1 from public.hr_tick_probe where id = v_id) then
      raise exception 'p9d: prune kept a row opened 15 days ago';
    end if;
    -- (e) the shape forbids a closed row that keeps one half of the pair.
    begin
      insert into public.hr_tick_probe (user_id, slot, channel, holder, status, span_from, span_to,
                                        base_version, version_close, payload_open, payload_close,
                                        input, seed, result, closed_at)
      values (v_u, 2, 'combat', v_h, 'closed', v_t0, v_t0 + interval '4 hours 1 minute',
              3, 3, 'unpacked', 'unpacked', v_in, null, '{"ticks":1}'::jsonb, now());
      raise exception 'p9e: a closed row with input but no seed was admitted';
    exception when check_violation then null;
    end;

    -- ── p7 THE KILL SWITCH: off, the probe is refused and writes nothing.
    update public.hr_tick_config set enabled = false where id;
    v_r := public.hr_tick_probe_commit(v_h, v_u, 0, 'gather', v_t2 - interval '90 seconds', v_t2,
             'unpacked', null, null, '{"k":3}'::jsonb);
    if v_r->>'error' is distinct from 'tick_disabled' then raise exception 'p7: the kill switch did not refuse: %', v_r; end if;

    -- ── p8 THE DETECTOR, at chain end, strict and clean.
    v_r := public.hr_assert_grant_hygiene(true);
    if jsonb_array_length(coalesce(v_r->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'p8: the detector does not record the probe pair: %', v_r->'engine_execute_outside_allowlist';
    end if;

    raise exception 'HR1007_ROLLBACK_OK';
  exception when others then
    if sqlerrm <> 'HR1007_ROLLBACK_OK' then raise; end if;
  end;
end $$;
