-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-town-presence-journal.sql — THE THREE WEEK-1 VERBS JOIN THE
--                                        REFUSAL JOURNAL.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (`node tools/apply-migration.mjs supabase/migrations/2026-09-13-town-presence-journal.sql`)
--     AFTER a Security diff review. It restates three GATED WRAPPER bodies and
--     nothing else.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- 2026-09-13-town-presence.sql (APPLIED 2026-09-13 00:11 UTC, flag OFF) added
-- three client-callable gated wrappers — hr_heartbeat, hr_set_presence_quiet,
-- hr_town_of — and none of them carried the `hr_note_rejection` seam that
-- 2026-09-12-hr-rejections-journal.sql installs on every other one. The GitHub
-- db-replay job went red on exactly that, by name:
--
--   x P6: gated wrapper(s) without exactly one seam at CHAIN END:
--         hr_heartbeat, hr_set_presence_quiet, hr_town_of
--
-- The Security review had graded the missing journalling a P3 with "add it when
-- c-hr-rejections-journal lands". That was wrong in one respect and the guard is
-- the thing that said so: the seam is not a nice-to-have on a NEW verb, it is the
-- standing shape of a gated wrapper in this database, and P6's whole job is to
-- notice a wrapper that does not carry it — because that is indistinguishable
-- from a later migration restating a body and DELETING the seam (the b484-b487
-- class). A guard that cannot tell "never had it" from "just lost it" would be
-- useless, so it treats both as red. Correct.
--
-- ── WHAT IS RESTATED, AND WHAT IS NOT ──────────────────────────────────────
-- RESTATED: the three WRAPPER bodies (the ~6-line gate shells), each gaining
--   exactly ONE seam, in the same form §6 of the rejections-journal file
--   generates for the other 49:
--     return public.X__ungated($1, $2);
--   → return public.hr_note_rejection('X', <slot>, public.X__ungated($1, $2));
--   with <slot> = the wrapper's own `p_slot` parameter where it has one and 0
--   where it does not (an account- or zone-scoped verb has no character).
--
-- UNTOUCHED: every `__ungated` body, hr_town_refresh, hr_flag_on,
--   hr_activity_label, hr_town_zone, hr_state_of, hr_rpc_gate, every table,
--   every grant, every policy, the catalogues, and hr_record_rejection /
--   hr_note_rejection / hr_rejection_verb themselves. §0b fingerprints the three
--   `__ungated` bodies into a session GUC BEFORE the restatement and §4(a)
--   re-derives that fingerprint afterwards, so "untouched" is measured rather
--   than asserted in prose.
--
-- ── THE VERB MAP NEEDED NO EDIT, AND THAT IS A FACT, NOT AN OMISSION ───────
-- The Coordinator's brief asked for the three verbs to be added to the verb map.
-- There is no list to add them to, and §4(b) proves it: the parallel `c_verbs`
-- array in the rejections-journal file covers only the SEVEN SELF-GATING verbs
-- (§7 of that file — bodies with no `__ungated` twin, which have to be labelled
-- by hand). A GATED WRAPPER's label is derived from its own proname by the
-- decorator (`quote_literal(r.proname)`) and bounded by hr_rejection_verb(), so
-- these three land in `hr_rejections.verbs` as `hr_heartbeat`,
-- `hr_set_presence_quiet` and `hr_town_of` the moment the seam exists. §4(b)
-- asserts each token round-trips through hr_rejection_verb unchanged (the longest
-- is 21 characters against its 24-character cap), so a refusal reads as the verb
-- that caused it and never as somebody else's `accrue`.
--
-- ── ONE DELIBERATE DEPARTURE FROM THE MECHANICAL DECORATION (hr_town_of) ────
-- The generic decorator wraps ONLY the inner call, and P6 requires EXACTLY ONE
-- seam per wrapper — so a refusal the WRAPPER itself decides is invisible to it.
-- hr_heartbeat and hr_set_presence_quiet are unaffected: their only wrapper-level
-- return is `rate_limited`, which is deliberately never journalled here (R1 of
-- the rejections-journal file: hr_rpc_gate owns that code and samples it; a
-- 200-call storm must cost 63 writes, not 203). hr_town_of is different — it
-- decides `bad_zone` and `unauthenticated` in the wrapper, before the inner call.
-- Mechanically decorated, `bad_zone` would never be journalled, and `bad_zone` is
-- precisely the interesting refusal: it is the one a client can only produce by
-- naming a zone that does not exist, i.e. by probing.
--
-- So hr_town_of's wrapper routes its own refusal THROUGH THE SAME SINGLE SEAM
-- with a CASE (lazily evaluated, so the inner is not called on a refusal). One
-- `hr_note_rejection(` occurrence, P6 satisfied, and the refusal that matters is
-- recorded. The alternative — moving the zone check into the `__ungated` inner —
-- was rejected: that body is STABLE by design and a validation that has to run
-- before a cached read does not belong inside it.
--
-- `unauthenticated` is in the CASE for completeness and will never be recorded:
-- hr_note_rejection returns early when auth.uid() is null, because there is no
-- user to key the row on. Stated rather than discovered later.
--
-- ── ROWS AND BYTES AT 100× PLAYERS ─────────────────────────────────────────
-- Nothing new is stored. hr_rejections is keyed (user_id, slot, day, code), so a
-- character's refusals of any of these verbs fold into at most one row per code
-- per UTC day, with the verb map carrying which verbs contributed (capped at 24
-- keys by hr_verb_bump). The worst case is a tampered client spamming
-- hr_heartbeat on a slot it does not own: 6/min (its bucket), all folding onto
-- ONE tuple under slot -1 and code `no_character` — the same upsert rate the
-- other 49 wrappers already have, and a tenth of the gate's own.
-- ACCEPTED calls write nothing: hr_note_rejection returns immediately unless
-- `ok` is false. The heartbeat's hot path — one call per 25 s per player — is
-- therefore unchanged, and §4(c) measures that it writes no row.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
-- Re-apply 2026-09-13-town-presence.sql: it restates the same three wrappers
-- WITHOUT the seam, which is exactly the undo (and then P6 is red again, which
-- is the correct signal). No table, column, grant, policy, row, cron entry or
-- catalogue is touched here, so there is nothing else to undo.
--
-- SAFE TO RE-RUN. The bodies are authored in full (`create or replace`), not
-- patched by anchor, so a second apply installs byte-identical text; §4
-- re-asserts every property.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PREFLIGHT ────────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null then
    raise exception 'hr_note_rejection is absent — apply 2026-09-12-hr-rejections-journal.sql first; '
                    'without it these bodies would not install';
  end if;
  if to_regprocedure('public.hr_rejection_verb(text)') is null then
    raise exception 'hr_rejection_verb is absent — apply 2026-09-12-hr-rejections-journal.sql first';
  end if;
  -- The `verbs` maintenance must already be IN hr_record_rejection, or the seam
  -- would file rows with an empty verb map and the journal would name no verb —
  -- which is the whole point of this file.
  if position('hr_verb_bump' in pg_get_functiondef(
       'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)'::regprocedure)) = 0 then
    raise exception 'hr_record_rejection does not maintain the verbs map — 2026-09-12-hr-rejections-'
                    'journal.sql §5 has not been applied, so a seam added here would record no verb';
  end if;
  if to_regprocedure('public.hr_heartbeat__ungated(integer)') is null
     or to_regprocedure('public.hr_set_presence_quiet__ungated(integer,boolean)') is null
     or to_regprocedure('public.hr_town_of__ungated(text)') is null then
    raise exception 'the town-presence inners are absent — apply 2026-09-13-town-presence.sql first';
  end if;
  if to_regprocedure('public.hr_flag_on(text)') is null
     or to_regprocedure('public.hr_town_zone()') is null then
    raise exception 'hr_flag_on / hr_town_zone are absent — apply 2026-09-13-town-presence.sql first';
  end if;
  -- R4, re-derived here rather than trusted: hr_note_rejection takes and returns
  -- jsonb, and json -> jsonb is an ASSIGNMENT cast that PL/pgSQL resolves at
  -- first EXECUTION — so decorating a non-jsonb wrapper installs clean, passes
  -- every text sweep, and fails the first time a player calls it.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('hr_heartbeat', 'hr_set_presence_quiet', 'hr_town_of',
                           'hr_heartbeat__ungated', 'hr_set_presence_quiet__ungated',
                           'hr_town_of__ungated')
         and pg_get_function_result(p.oid) = 'jsonb') <> 6 then
    raise exception 'one of the six town-presence functions does not return jsonb — the seam would '
                    'resolve at first execution and fail there (R4)';
  end if;
end $mig$;

-- ── 0b. FINGERPRINT THE INNERS, BEFORE ANYTHING IS REPLACED ────────────────
-- "The __ungated bodies are untouched" is a claim, so it is measured. The
-- fingerprint rides a session GUC (no object created, nothing to clean up) and
-- §4(a) re-derives it after the restatement.
do $$
begin
  perform set_config('hearthrise.tp_inners_before',
    (select md5(string_agg(p.prosrc, '|' order by p.proname))
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('hr_heartbeat__ungated', 'hr_set_presence_quiet__ungated',
                          'hr_town_of__ungated')),
    false);
end $$;

-- ── 1. hr_heartbeat — the wrapper, with the seam ───────────────────────────
-- Byte-for-byte the body 2026-09-13-town-presence.sql installed, with ONE
-- insertion. p_slot KEEPS ITS DEFAULT: PostgREST resolves an RPC by the named
-- arguments in the POST body, and dropping it turns every heartbeat into a
-- PGRST202 that looks like "the migration was never applied".
create or replace function public.hr_heartbeat(p_slot int default 0)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_heartbeat') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return public.hr_note_rejection('hr_heartbeat', p_slot, public.hr_heartbeat__ungated($1));
end $w$;
revoke execute on function public.hr_heartbeat(int) from public;
revoke execute on function public.hr_heartbeat(int) from anon, authenticated, service_role;
grant  execute on function public.hr_heartbeat(int) to authenticated;

-- ── 2. hr_set_presence_quiet — the wrapper, with the seam ──────────────────
create or replace function public.hr_set_presence_quiet(
  p_slot int default 0, p_quiet boolean default true)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_set_presence_quiet') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return public.hr_note_rejection('hr_set_presence_quiet', p_slot,
    public.hr_set_presence_quiet__ungated($1, $2));
end $w$;
revoke execute on function public.hr_set_presence_quiet(int, boolean) from public;
revoke execute on function public.hr_set_presence_quiet(int, boolean)
  from anon, authenticated, service_role;
grant  execute on function public.hr_set_presence_quiet(int, boolean) to authenticated;

-- ── 3. hr_town_of — the wrapper, with the seam, covering its OWN refusal ───
-- See the header. The CASE is what keeps this to ONE seam while still recording
-- `bad_zone`: CASE is lazily evaluated, so the inner read runs only on the
-- else arm and a refused call still costs no snapshot read.
--
-- ⚠ THE ORDER OF THE THREE EARLY RETURNS IS LOAD-BEARING AND UNCHANGED:
--   rate gate FIRST (so "off" is not a free unlimited call), flag SECOND (so the
--   feature is closed before any data is shaped), and only then the refusals.
--   `off` is ok:true — not a refusal — so the seam correctly ignores it.
create or replace function public.hr_town_of(p_zone text default 'the_common')
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
declare v_zone text := coalesce(nullif(p_zone, ''), public.hr_town_zone());
begin
  if not public.hr_rpc_gate('hr_town_of') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if not public.hr_flag_on('town_presence') then
    return jsonb_build_object('ok', true, 'off', true);
  end if;
  return public.hr_note_rejection('hr_town_of', 0,
    case
      when auth.uid() is null
        then jsonb_build_object('ok', false, 'error', 'unauthenticated')
      when v_zone <> public.hr_town_zone()
        then jsonb_build_object('ok', false, 'error', 'bad_zone')
      else public.hr_town_of__ungated(v_zone)
    end);
end $w$;
revoke execute on function public.hr_town_of(text) from public;
revoke execute on function public.hr_town_of(text) from anon, authenticated, service_role;
grant  execute on function public.hr_town_of(text) to authenticated;

-- ── 4. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Properties proven by EXECUTING SQL. The apply is atomic, so a raise here
-- reverts §1-§3. The row-writing probes live in a subtransaction discarded by a
-- sentinel raise (HR812), so this block is net-zero on production.
do $$
declare
  v_bad   text;
  v_txt   text;
  v_n     int;
  v_res   jsonb;
  v_row   record;
  v_uid   constant uuid := '000000ad-0000-0000-0000-0000000000a1';
  v_other constant uuid := '000000ad-0000-0000-0000-0000000000a2';
  v_flag_was boolean;
begin
  -- (a) THE INNERS ARE UNTOUCHED, measured against §0b's fingerprint, and they
  --     carry NO seam of their own (a seam on the inner would double-record and
  --     make P6's "exactly one" arithmetic meaningless).
  if coalesce(current_setting('hearthrise.tp_inners_before', true), '') = '' then
    raise exception 'GATE(a): §0b did not record the inner fingerprint — this block cannot prove the '
                    '__ungated bodies are untouched, so it refuses to claim it';
  end if;
  if (select md5(string_agg(p.prosrc, '|' order by p.proname))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('hr_heartbeat__ungated', 'hr_set_presence_quiet__ungated',
                           'hr_town_of__ungated'))
     <> current_setting('hearthrise.tp_inners_before', true) then
    raise exception 'GATE(a): an __ungated body CHANGED — this file restates wrappers only';
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_heartbeat__ungated', 'hr_set_presence_quiet__ungated',
                       'hr_town_of__ungated')
     and position('hr_note_rejection' in p.prosrc) > 0;
  if v_bad is not null then
    raise exception 'GATE(a): the seam reached an __ungated body (%) — it would record twice', v_bad;
  end if;
  -- positive controls: the inners still contain the logic they are load-bearing
  -- for, so "unchanged" is not "unchanged and empty".
  if position('c_floor' in (select prosrc from pg_proc p join pg_namespace n
                              on n.oid = p.pronamespace
                             where n.nspname = 'public'
                               and p.proname = 'hr_heartbeat__ungated')) = 0 then
    raise exception 'GATE(a): hr_heartbeat__ungated lost the 20-second floor';
  end if;
  if position('presence_quiet' in (select prosrc from pg_proc p join pg_namespace n
                                     on n.oid = p.pronamespace
                                    where n.nspname = 'public'
                                      and p.proname = 'hr_set_presence_quiet__ungated')) = 0 then
    raise exception 'GATE(a): hr_set_presence_quiet__ungated lost the column it writes';
  end if;

  -- (a2) EXACTLY ONE SEAM PER WRAPPER — P6's own arithmetic, run here so the
  --      file cannot install a body the standing guard will reject.
  for v_txt in select unnest(array['hr_heartbeat', 'hr_set_presence_quiet', 'hr_town_of']) loop
    select (select count(*) from regexp_matches(p.prosrc, 'hr_note_rejection\(', 'g')) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_txt;
    if v_n <> 1 then
      raise exception 'GATE(a2): % carries % seam(s), need exactly 1 (P6)', v_txt, v_n;
    end if;
    -- ...and the gate is still in front of it. A seam that replaced the gate
    -- would be an ungated privileged verb with good observability.
    if position('hr_rpc_gate(''' || v_txt || ''')' in
                (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = v_txt)) = 0 then
      raise exception 'GATE(a2): % no longer calls hr_rpc_gate with its own bucket', v_txt;
    end if;
  end loop;
  -- CHAIN-END SWEEP, both directions, exactly as tests/rejections-journal.mjs P6
  -- and P6b run it: NO jsonb gated wrapper anywhere in public may be missing the
  -- seam, and no non-jsonb wrapper may have acquired one.
  select coalesce(string_agg(p.proname, ', ' order by p.proname), '') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and exists (select 1 from pg_proc q2 join pg_namespace m on m.oid = q2.pronamespace
                  where m.nspname = 'public' and q2.proname = p.proname || '__ungated')
     and pg_get_function_result(p.oid) = 'jsonb'
     and coalesce((select pg_get_function_result(q2.oid) from pg_proc q2
                     join pg_namespace m on m.oid = q2.pronamespace
                    where m.nspname = 'public' and q2.proname = p.proname || '__ungated' limit 1), '')
         = 'jsonb'
     and (select count(*) from regexp_matches(p.prosrc, 'hr_note_rejection\(', 'g')) <> 1;
  if v_bad <> '' then
    raise exception 'GATE(a2): gated wrapper(s) still without exactly one seam at chain end: %', v_bad;
  end if;
  select coalesce(string_agg(p.proname, ', ' order by p.proname), '') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and position('hr_note_rejection' in p.prosrc) > 0
     and exists (select 1 from pg_proc q2 join pg_namespace m on m.oid = q2.pronamespace
                  where m.nspname = 'public' and q2.proname = p.proname || '__ungated')
     and (pg_get_function_result(p.oid) <> 'jsonb'
       or coalesce((select pg_get_function_result(q2.oid) from pg_proc q2
                      join pg_namespace m on m.oid = q2.pronamespace
                     where m.nspname = 'public' and q2.proname = p.proname || '__ungated' limit 1), '')
           <> 'jsonb');
  if v_bad <> '' then
    raise exception 'GATE(a2): a NON-jsonb wrapper carries the seam (%) — it installs clean and fails '
                    'at first execution (R4)', v_bad;
  end if;

  -- (b) THE VERB LABELS. Derived from proname, bounded by hr_rejection_verb, and
  --     each must round-trip unchanged — otherwise a refusal reads as some other
  --     verb's bucket, which is the exact defect the verbs column was added for.
  for v_txt in select unnest(array['hr_heartbeat', 'hr_set_presence_quiet', 'hr_town_of']) loop
    if public.hr_rejection_verb(v_txt) <> v_txt then
      raise exception 'GATE(b): hr_rejection_verb(%) = % — the label does not survive the bound, so '
                      'the journal would name the wrong verb', v_txt, public.hr_rejection_verb(v_txt);
    end if;
  end loop;

  -- (c) GRANTS ARE UNCHANGED. `create or replace` preserves an ACL, but "it
  --     should" is not a control on the three most client-reachable functions
  --     this lane owns.
  for v_txt in select unnest(array['public.hr_heartbeat(integer)',
                                   'public.hr_set_presence_quiet(integer,boolean)',
                                   'public.hr_town_of(text)']) loop
    if not has_function_privilege('authenticated', v_txt, 'execute') then
      raise exception 'GATE(c): % is no longer callable by authenticated — the restatement killed the '
                      'verb', v_txt;
    end if;
    select string_agg(r, ',') into v_bad from unnest(array['anon', 'service_role', 'hr_engine']) r
     where has_function_privilege(r, v_txt, 'execute');
    if v_bad is not null then
      raise exception 'GATE(c): % is executable by %', v_txt, v_bad; end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = to_regprocedure(v_txt)
                  and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'GATE(c): PUBLIC holds EXECUTE on %', v_txt; end if;
  end loop;
  select string_agg(p.proname || ':' || coalesce(r.rolname, 'PUBLIC'), ', ') into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public'
     and p.proname in ('hr_heartbeat__ungated', 'hr_set_presence_quiet__ungated',
                       'hr_town_of__ungated', 'hr_note_rejection')
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role', 'hr_engine'));
  if v_bad is not null then
    raise exception 'GATE(c): a privileged inner or the recorder is client-reachable (%)', v_bad;
  end if;
  if to_regclass('public.hr_client_rpc_baseline') is not null then
    select count(*) into v_n from public.hr_client_rpc_baseline;
    if v_n <> 77 then
      raise exception 'GATE(c): hr_client_rpc_baseline holds % rows, expected the 77 this lane left '
                      'it at — this file approves no new client surface', v_n;
    end if;
    select string_agg(x, ', ') into v_bad
      from unnest(array['hr_heartbeat', 'hr_set_presence_quiet', 'hr_town_of']) x
     where not exists (select 1 from public.hr_client_rpc_baseline b
                        where b.proname = x and b.grantee = 'authenticated');
    if v_bad is not null then
      raise exception 'GATE(c): % fell out of hr_client_rpc_baseline', v_bad; end if;
  end if;

  -- (d) EXECUTED, on synthetic accounts, in a discarded subtransaction.
  select enabled into v_flag_was from public.hr_flags where key = 'town_presence';
  begin
    insert into auth.users (id) values (v_uid), (v_other) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values
      (v_uid, 'JnlOne'), (v_other, 'JnlTwo')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, 0, 0, 0, 3), (v_other, 0, 0, 0, 3)
      on conflict (user_id, slot) do update set version = 3;
    update public.hr_flags set enabled = true where key = 'town_presence';
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    -- (d1) AN ACCEPTED CALL WRITES NOTHING. The heartbeat is the hot path — one
    --      call per 25 s per player — and a journal row on the accepted path
    --      would be the game_events mistake with a new name.
    v_res := public.hr_heartbeat(0);
    if coalesce(v_res->>'ok', '') <> 'true' then
      raise exception 'GATE(d1): the restated wrapper broke the happy path: %', v_res; end if;
    if exists (select 1 from public.hr_rejections where user_id = v_uid) then
      raise exception 'GATE(d1): an ACCEPTED heartbeat journalled a refusal row';
    end if;

    -- (d2) A REFUSAL LANDS ONE AGGREGATE ROW, WITH ITS VERB. hr_heartbeat(9) is
    --      a slot the caller does not own; p_slot is part of the primary key and
    --      the client picks it, so 9 must fold to -1 (R2) rather than invent a
    --      row under a character that does not exist.
    v_res := public.hr_heartbeat(9);
    if coalesce(v_res->>'error', '') <> 'no_character' then
      raise exception 'GATE(d2): the heartbeat refusal changed shape: %', v_res; end if;
    select * into v_row from public.hr_rejections where user_id = v_uid;
    if not found then
      raise exception 'GATE(d2): a refused heartbeat journalled NOTHING — the seam is decoration';
    end if;
    if v_row.code <> 'no_character' then
      raise exception 'GATE(d2): the row was filed under code % ', v_row.code; end if;
    if v_row.slot <> -1 then
      raise exception 'GATE(d2): slot 9 was filed as % — a client-chosen slot is a row multiplier '
                      'unless it is folded (R2)', v_row.slot;
    end if;
    if not (v_row.verbs ? 'hr_heartbeat') then
      raise exception 'GATE(d2): the row names no hr_heartbeat verb (%) — a refusal that reads as '
                      'somebody else''s verb is the defect the verbs column exists for', v_row.verbs;
    end if;

    -- (d2b) AT MOST ONE OCCURRENCE PER TRANSACTION, which is the clamp
    --       hr_note_rejection inherits from the `hearthrise.rejection_noted`
    --       GUC hr_record_rejection sets. A second refusal inside THIS
    --       transaction must add nothing — that is what keeps a body that
    --       refuses twice from doubling the count. In production every RPC call
    --       is its own transaction, so each refusal is recorded once; the probes
    --       below therefore reset the flag between calls, exactly as
    --       tests/rejections-journal.mjs does, and this arm is why.
    v_res := public.hr_heartbeat(9);
    select n into v_n from public.hr_rejections where user_id = v_uid and code = 'no_character';
    if v_n <> 1 then
      raise exception 'GATE(d2b): a second refusal in the SAME transaction moved the count to % — the '
                      'once-per-transaction clamp is gone and a body that refuses twice double-counts',
                      v_n;
    end if;
    perform set_config('hearthrise.rejection_noted', '', true);

    -- (d3) THE AGGREGATE FOLDS BY CODE AND KEEPS BOTH VERBS. A quiet toggle on
    --      the same impossible slot is the SAME primary key (user, -1, day,
    --      no_character): one row, n=2, TWO verbs. This is the property the
    --      journal was rebuilt for — Paione's day read `version_conflict |
    --      accrue | n=10` with the equips unreadable inside it.
    v_res := public.hr_set_presence_quiet(9, true);
    if coalesce(v_res->>'error', '') <> 'no_character' then
      raise exception 'GATE(d3): the quiet refusal changed shape: %', v_res; end if;
    select count(*) into v_n from public.hr_rejections
     where user_id = v_uid and code = 'no_character';
    if v_n <> 1 then
      raise exception 'GATE(d3): two verbs refusing the same code produced % rows — the aggregate is '
                      'not folding', v_n;
    end if;
    select * into v_row from public.hr_rejections
     where user_id = v_uid and code = 'no_character';
    if v_row.n <> 2 then
      raise exception 'GATE(d3): the folded row counts % of 2 occurrences', v_row.n; end if;
    if not (v_row.verbs ? 'hr_heartbeat') or not (v_row.verbs ? 'hr_set_presence_quiet') then
      raise exception 'GATE(d3): the folded row names % — both verbs must survive the fold, which is '
                      'the entire reason the map exists', v_row.verbs;
    end if;

    -- (d4) hr_town_of's OWN refusal is journalled — the departure from the
    --      mechanical decoration, proven rather than described. `bad_zone` is
    --      decided in the WRAPPER, so a seam that only wrapped the inner call
    --      would never see it.
    perform set_config('hearthrise.rejection_noted', '', true);
    v_res := public.hr_town_of('nowhere_at_all');
    if coalesce(v_res->>'error', '') <> 'bad_zone' then
      raise exception 'GATE(d4): an unknown zone was not refused bad_zone: %', v_res; end if;
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'bad_zone';
    if not found then
      raise exception 'GATE(d4): bad_zone was NOT journalled — the wrapper''s own refusal is invisible, '
                      'and it is the one a client can only produce by probing for zones';
    end if;
    if not (v_row.verbs ? 'hr_town_of') then
      raise exception 'GATE(d4): the bad_zone row names no hr_town_of verb (%)', v_row.verbs; end if;
    if v_row.slot <> 0 then
      raise exception 'GATE(d4): a zone read was filed under slot % — it has no character', v_row.slot;
    end if;
    -- ...and the ACCEPTED read still works and still journals nothing new.
    select count(*) into v_n from public.hr_rejections where user_id = v_uid;
    v_res := public.hr_town_of('the_common');
    if coalesce(v_res->>'ok', '') <> 'true' or v_res ? 'off' then
      raise exception 'GATE(d4): the restated hr_town_of broke the happy path: %', v_res; end if;
    if (select count(*) from public.hr_rejections where user_id = v_uid) <> v_n then
      raise exception 'GATE(d4): an ACCEPTED town read journalled a refusal';
    end if;

    -- (d5) rate_limited IS NOT JOURNALLED BY THE SEAM, and that is deliberate
    --      (R1 of 2026-09-12-hr-rejections-journal.sql: hr_rpc_gate owns the code
    --      and SAMPLES it, so a 200-call storm costs 63 writes and not 203). The
    --      brief asked for a storm to land a row; it must not, and the property is
    --      asserted on the seam itself rather than on the gate's sampling, so this
    --      measures the thing this file installs.
    select count(*) into v_n from public.hr_rejections where user_id = v_uid;
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_note_rejection('hr_town_of', 0,
      '{"ok":false,"error":"rate_limited"}'::jsonb);
    if (select count(*) from public.hr_rejections where user_id = v_uid) <> v_n then
      raise exception 'GATE(d5): the seam journalled a rate_limited refusal — a retry storm would '
                      'turn the cheapest possible refusal into a durable upsert per call';
    end if;

    -- (d6) ANOTHER PLAYER IS UNTOUCHED. The seam keys on auth.uid(), not on
    --      anything the caller sent.
    if exists (select 1 from public.hr_rejections where user_id = v_other) then
      raise exception 'GATE(d6): one player''s refusals were filed against another account';
    end if;

    raise exception using errcode = 'HR812', message = 'town-presence-journal §4 complete — rolling back';
  exception when sqlstate 'HR812' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.hr_rejections where user_id in (v_uid, v_other))
     or exists (select 1 from public.player_state where user_id in (v_uid, v_other))
     or exists (select 1 from public.profiles where id in (v_uid, v_other))
     or exists (select 1 from auth.users where id in (v_uid, v_other)) then
    raise exception 'GATE: §4 LEAKED a probe row';
  end if;
  if (select enabled from public.hr_flags where key = 'town_presence') is distinct from v_flag_was then
    raise exception 'GATE: §4 changed the town_presence flag — the probe''s flip escaped the rollback';
  end if;

  raise notice 'town-presence-journal: the three Week-1 wrappers each carry EXACTLY ONE seam with the '
               'gate still in front of it, every __ungated body is byte-identical to before this file, '
               'no jsonb gated wrapper in public is missing a seam and no non-jsonb one has acquired '
               'it, the three verb labels round-trip through hr_rejection_verb, grants and the '
               '77-row client baseline are unchanged, and EXECUTED: an accepted call journals '
               'nothing, a refused heartbeat files one row under slot -1 naming hr_heartbeat, a '
               'second verb refusing the same code folds into that row as n=2 with BOTH verbs, '
               'hr_town_of''s own bad_zone is journalled under slot 0 naming hr_town_of, the seam '
               'refuses to journal rate_limited, and no other account was touched — all green';
end $$;
