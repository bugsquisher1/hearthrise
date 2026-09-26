-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-26-party-view-volatile.sql
-- THE PARTY ROSTER READ WRITES, SO IT MAY NOT BE DECLARED STABLE.
--
-- Found by PLAYING live b553 on the QA account (2026-09-26 03:10 UTC): Party >
-- Form a party succeeds (party_member row: leader, slot 2) and the panel says
-- "Your party 0 of 4 / LEADER" with no member rows. The direct call as that
-- user answers
--   POST /rest/v1/rpc/hr_party_view → HTTP 405
--   {"code":"25006","message":"cannot execute INSERT in a read-only transaction"}
--
-- ROOT CAUSE. 2026-09-23-m8-parties-s1-1-tables.sql §6 declares hr_party_view
-- `language plpgsql STABLE security definer`, and its first act is
-- hr_rpc_gate('party'), which INSERTs/UPDATEs public.hr_rate_counters. PostgREST
-- runs a STABLE or IMMUTABLE function inside a READ ONLY transaction whatever
-- the HTTP verb, so every live roster read has failed since S1 applied. The
-- §7 self-check of that file called the view from a normal migration
-- transaction, and the in-page tests stub a server-shaped answer — neither
-- ever executed it the way PostgREST does. tests/readonly-rpc.mjs now does, for
-- every client-callable STABLE/IMMUTABLE function (the class; measured on the
-- full replay chain at next 10936397: hr_party_view is its ONLY member).
--
-- WHAT IT DOES: `alter function … volatile`. One attribute. The body, the
-- SECURITY DEFINER bit, the search_path, the owner, the comment and the grants
-- are untouched by construction — nothing is restated, so nothing can drift in
-- a restatement, and the S-7 frozen shape is exactly the reviewed one.
-- VOLATILE is the honest declaration: the function writes the rate bucket, and
-- the bucket must keep counting roster reads (a 12/min party bucket is what
-- makes a guessed party uuid expensive, S-7/S-13).
--
-- IDEMPOTENT: altering an already-volatile function is a no-op; a second apply
-- is byte-identical. Not a money surface: no value, row or grant moves.
-- STAGED — SECURITY GO REQUIRED before apply (CLAUDE.md §2, it touches a
-- client RPC's execution contract).
-- ═══════════════════════════════════════════════════════════════════════════

alter function public.hr_party_view(uuid) volatile;

-- ── §4 SELF-CHECK — asserted by EXECUTION; every probe row rolled back ──────
do $chk$
declare
  v_a     constant uuid := '00000000-0000-4000-8000-0000b8260001';
  v_p     uuid;
  v_r     jsonb;
  v_state text;
  v_n     int;
  v_cfg   text[];
  t       text;
begin
  -- (a) THE DECLARATION. provolatile is what PostgREST reads to pick a
  --     read-only transaction; 'v' is the only value that gets a writable one.
  --     And the alter moved nothing else: still SECURITY DEFINER, same pinned
  --     search_path.
  select p.provolatile::text, p.proconfig into v_state, v_cfg
    from pg_proc p where p.oid = to_regprocedure('public.hr_party_view(uuid)');
  if v_state is distinct from 'v' then
    raise exception 'GATE(a): hr_party_view is provolatile=% — PostgREST will run it READ ONLY and its rate-gate INSERT raises 25006 on every roster read.', v_state;
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.hr_party_view(uuid)')) then
    raise exception 'GATE(a): hr_party_view lost SECURITY DEFINER';
  end if;
  if v_cfg is distinct from array['search_path=public, pg_catalog'] then
    raise exception 'GATE(a): hr_party_view''s proconfig is %, not the pinned search_path', v_cfg;
  end if;

  -- (b) NO GRANT WIDENED: authenticated only, exactly as S1 shipped it.
  foreach t in array array['anon','service_role'] loop
    if has_function_privilege(t, 'public.hr_party_view(uuid)', 'execute') then
      raise exception 'GATE(b): % can EXECUTE hr_party_view — it is `authenticated` ONLY.', t;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_party_view(uuid)', 'execute') then
    raise exception 'GATE(b): `authenticated` cannot EXECUTE hr_party_view — the panel ships dead.';
  end if;
  select count(*) into v_n from public.hr_client_rpc_baseline
   where proname = 'hr_party_view';
  if v_n <> 1 or not exists (select 1 from public.hr_client_rpc_baseline
                              where proname = 'hr_party_view' and identity_args = 'p_party uuid'
                                and grantee = 'authenticated') then
    raise exception 'GATE(b): hr_client_rpc_baseline no longer holds exactly the one approved hr_party_view row';
  end if;

  -- (c)(d) need a real member. ── SUBTRANSACTION, rolled back at HR826 ──────
  begin
    insert into auth.users (id) values (v_a);
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'created', v_r->>'ok') is distinct from 'true' then
      raise exception 'GATE: no probe character: %', v_r; end if;
    v_r := public.hr_party_create(0, gen_random_uuid());
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE: hr_party_create refused the probe: %', v_r; end if;
    v_p := (v_r->>'party_id')::uuid;

    -- (c) WHY STABLE WAS FATAL, DOCUMENTED BY EXECUTION: inside a READ ONLY
    --     transaction — what PostgREST opens for a non-volatile function — the
    --     view raises 25006. If this ever stops raising, the view stopped
    --     writing and the declaration may be revisited; until then it is the
    --     reason for this file. The inner block's rollback restores read-write.
    v_state := null;
    begin
      set local transaction_read_only = on;
      v_r := public.hr_party_view(v_p);
      raise exception using errcode = 'HR827', message = 'no write attempted';
    exception when others then
      v_state := sqlstate;
    end;
    if v_state is distinct from '25006' then
      raise exception 'GATE(c): hr_party_view under a READ ONLY transaction raised % (expected 25006, the write the declaration must admit).', v_state;
    end if;
    if current_setting('transaction_read_only') <> 'off' then
      raise exception 'GATE(c): the read-only probe leaked out of its subtransaction';
    end if;

    -- (d) AND IN A NORMAL TRANSACTION IT ANSWERS THE CALLER'S OWN ROW.
    v_r := public.hr_party_view(v_p);
    if coalesce(v_r->>'ok','') <> 'true' then
      raise exception 'GATE(d): hr_party_view refused its own leader: %', v_r; end if;
    if jsonb_array_length(v_r->'members') <> 1 then
      raise exception 'GATE(d): hr_party_view returned % member row(s) for a party of one', jsonb_array_length(v_r->'members'); end if;

    raise exception using errcode = 'HR826', message = 'party-view-volatile §4 complete — rolling back';
  exception when sqlstate 'HR826' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (e) THE CLASS IS EMPTY: no function a client role can execute is declared
  --     STABLE or IMMUTABLE. A read-only function a client calls through
  --     PostgREST that ever writes is this bug again; tests/readonly-rpc.mjs
  --     calls each one READ ONLY on every push, this is the apply-time half.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.provolatile <> 'v'
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute'));
  if v_n <> 0 then
    raise exception 'GATE(e): % client-executable public function(s) are STABLE/IMMUTABLE — run tests/readonly-rpc.mjs and prove each is read-only before admitting it.', v_n;
  end if;

  -- (f) THE DETECTOR IS GREEN.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_r := public.hr_assert_grant_hygiene(true);
    if jsonb_array_length(coalesce(v_r->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_r->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_r->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(f): hr_assert_grant_hygiene is RED after this file: %', v_r; end if;
  end if;

  -- (z) NO PROBE ROW SURVIVED.
  if exists (select 1 from auth.users where id = v_a)
     or exists (select 1 from public.player_state where user_id = v_a)
     or exists (select 1 from public.party where leader_user = v_a)
     or exists (select 1 from public.party_member where user_id = v_a)
     or exists (select 1 from public.hr_rate_counters where user_id = v_a) then
    raise exception 'GATE(z): the §4 block LEAKED a probe row';
  end if;

  raise notice 'party-view-volatile: hr_party_view is VOLATILE, still SECURITY DEFINER with its pinned search_path, authenticated-only and baselined once; READ ONLY it raises 25006 (why STABLE was fatal), in a normal transaction it answers its own leader; no client-executable function is STABLE/IMMUTABLE; grant hygiene green; zero rows left';
end $chk$;
