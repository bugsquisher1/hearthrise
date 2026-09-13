-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-buff-shape-code.sql — A FORGED BUFF SHAPE GETS ITS OWN CODE.
--
-- Security, 2026-09-13, on the consumable-buffs review: the refusal that fires
-- when a `buff_apply` carries ANY field beyond `item` — i.e. a caller naming a
-- buff's `until`, `magnitude`, `type`, `duration_ms` or `scale` — is raised as
-- `bad_buff_shape` instead of sharing `bad_buff_item`, so the rejections journal
-- can classify it `c_incident` (that array belongs to the rejections lane's file,
-- which must be applied AFTER this one — see the apply-order note).
--
-- ── WHY A SECOND CODE AT ALL ───────────────────────────────────────────────
-- The two refusals mean opposite things about the CALLER:
--   · `bad_buff_item`  — "there is no buff for that item". An honest client
--     reaches it with a stale catalogue after a content push, or by eating a
--     Trout. Ordinary, expected, severity NORMAL.
--   · `bad_buff_shape` — "you sent a field the contract does not have". NO
--     honest client can produce it: the eat path sends exactly `{item}`, so the
--     only ways to get here are a hand-built request or an engine that has
--     diverged from the contract. One occurrence is worth looking at; a hundred
--     is somebody probing for a buff they can author.
-- They shared a code, and `hr_rejections` aggregates per (user, slot, day, code)
-- with `meta` last-writer-wins — so a forgery attempt was indistinguishable from
-- a player eating a Trout the moment either happened twice in a day. That is the
-- same readability defect the rejections lane exists to fix, one code deeper.
--
-- ── WHAT STAYS ON bad_buff_item, DELIBERATELY ──────────────────────────────
-- The other two shape refusals in the block — `buff_apply` not being an object,
-- and `item` not being a string — KEEP `bad_buff_item`, and that is a judgement,
-- not an oversight. They are what a BUGGY ENGINE produces (a null threaded into a
-- request, a number where a string belongs); an attacker gains nothing by sending
-- them, because they carry no forged VALUE. Promoting them to an incident code
-- would put engine bugs in the same bucket as forgery attempts and dilute exactly
-- the signal Security asked for. `bad_buff_shape` is reserved for the one shape
-- that says "a field was invented": a key that is not `item`.
--
-- ── WHAT THIS FILE IS NOT ──────────────────────────────────────────────────
-- It does not change WHETHER anything is refused — the same deltas are refused,
-- the same nothing is written, and the block still rolls back. It moves no value,
-- adds no table, column, index or grant, and reads nothing new from the client.
-- It does not touch the severity arrays (`c_incident` / `c_escalating`) or the
-- verb map: those live in 2026-09-13-rejections-verb-map-2.sql, which RESTATES
-- hr_record_rejection, so anything this file patched into that body would be
-- silently reverted by it. The classification is theirs, in their file, after
-- this one.
--
-- `bad_buff_shape` is a RELEASE CODE, like the `bad_buff_item` it splits from:
-- nothing was written, and withholding the idempotency key would brick it for up
-- to 25 hours over a client bug a redeploy fixes.
--
-- RESTATEMENT-DEBT-ACK: a two-anchor insert into the LIVE hr_apply body, which an
--   agent cannot read (tools/apply-migration.mjs and
--   tests/live-hash-drift.baseline.json are Coordinator-only). Both anchors are
--   text THIS LANE authored, so they are the one region of a 28-patch body this
--   file can account for line by line; a restatement would blind-overwrite
--   everyone else's patches on the economy's single write path (the b484-b487
--   class). Paydown stays the Coordinator's, scheduled.
--
-- ⚠ AFTER APPLYING: hr_apply is LIVE-HASH-TRACKED and patched programmatically —
--   re-seed with `node tests/live-hash-drift.mjs --live --write` (and note the
--   raw-vs-normalised md5 distinction recorded in the coupling file's apply-order
--   note: apply-migration reports RAW prosrc md5, live-hash-drift the
--   whitespace-NORMALISED one).
-- ⚠ APPLY ORDER: after 2026-09-13-consumable-buffs.sql (the block it renames),
--   and BEFORE 2026-09-13-rejections-verb-map-2.sql, whose verb map and severity
--   arrays need to know the new code.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, ANCHORS EXACTLY ONCE ───────────────────
do $mig$
declare
  v_apply text; v_n int;
  c_a_code constant text := $anc$        perform public.hr_reject('bad_buff_item',
          jsonb_build_object('why', 'forbidden_key',$anc$;
  c_a_rel  constant text := $anc$    'bad_buff_item', 'buff_at_max',$anc$;
begin
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply is missing — apply the apply-engine chain first'; end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  if strpos(v_apply, $q$if p_delta ? 'buff_apply' then$q$) = 0 then
    raise exception 'hr_apply does not handle buff_apply — apply 2026-09-13-consumable-buffs.sql first';
  end if;
  -- The forbidden-key GATE itself must be there. Renaming a refusal that does not
  -- fire would be a code nothing ever raises — a control that reads as present in
  -- review and exists for nobody.
  if strpos(v_apply, $q$where t.bk <> 'item'$q$) = 0 then
    raise exception 'hr_apply does not refuse a forged buff key — there is no refusal here to rename; '
                    'apply 2026-09-13-consumable-buffs.sql first';
  end if;

  v_n := (length(v_apply) - length(replace(v_apply, c_a_code, ''))) / length(c_a_code);
  if v_n <> 1 then raise exception 'hr_apply: the forbidden-key refusal anchor appears % time(s), '
                                  'expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_rel, ''))) / length(c_a_rel);
  if v_n <> 1 then raise exception 'hr_apply: the buff release-code anchor appears % time(s), expected '
                                  'exactly 1', v_n; end if;
end $mig$;

-- ── 1. THE PATCH ───────────────────────────────────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'bad_buff_shape') > 0 then
    raise notice 'hr_apply already raises bad_buff_shape — patch skipped'; return; end if;

  -- 1a. THE CODE. Only the forbidden-key arm: the not-an-object and
  --     item-not-a-string arms keep bad_buff_item (see the header).
  v_def := replace(v_def,
    $anc$        perform public.hr_reject('bad_buff_item',
          jsonb_build_object('why', 'forbidden_key',$anc$,
    $anc$        -- bad_buff_shape (Security, 2026-09-13): its OWN code, so the rejections
        -- journal can classify "a caller invented a field" as an INCIDENT without
        -- also flagging every player who ate a Trout. `why` stays for continuity
        -- and the key list stays with it — the same refusal, named honestly.
        perform public.hr_reject('bad_buff_shape',
          jsonb_build_object('why', 'forbidden_key',$anc$);

  -- 1b. THE RELEASE CODE, beside the family it splits from.
  v_def := replace(v_def,
    $anc$    'bad_buff_item', 'buff_at_max',$anc$,
    $anc$    'bad_buff_item', 'bad_buff_shape', 'buff_at_max',$anc$);

  execute v_def;
  raise notice 'hr_apply patched: a forged buff shape raises bad_buff_shape';
end $mig$;
-- create-or-replace preserves an ACL; re-state it anyway.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 2. SELF-CHECK (§4) — BY EXECUTION ──────────────────────────────────────
-- Both codes are DRIVEN: a forged key answers bad_buff_shape, an unknown item
-- still answers bad_buff_item, and neither writes anything. Net-zero: the probe
-- character is created and removed inside a subtransaction discarded by a
-- sentinel raise (HR828).
do $mig$
declare
  v_apply text; v_r jsonb; v_ver bigint; v_item text;
  v_uid  constant uuid := '000000b4-0000-0000-0000-0000000000b4';
  c_j    constant jsonb := '{"kind":"admin","intent":"buff-shape:probe"}'::jsonb;
begin
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_apply, $q$perform public.hr_reject('bad_buff_shape',$q$) = 0 then
    raise exception 'buff shape (a): the code did not install'; end if;
  if strpos(v_apply, $q$'bad_buff_item', 'bad_buff_shape', 'buff_at_max',$q$) = 0 then
    raise exception 'buff shape (a): bad_buff_shape is not a release code — a client bug would brick an '
                    'idempotency key for 25 hours'; end if;
  -- The honest code must SURVIVE: this file splits a family, it does not rename it.
  if strpos(v_apply, $q$perform public.hr_reject('bad_buff_item', jsonb_build_object('item', v_buff_item));$q$) = 0 then
    raise exception 'buff shape (a): the unknown-item refusal lost its code — an ordinary "that food has '
                    'no buff" would now read as a forgery incident';
  end if;
  -- …and the two engine-bug shape arms keep bad_buff_item (the header's judgement).
  if strpos(v_apply, $q$'why', 'not an object'$q$) = 0
     or strpos(v_apply, $q$'why', 'item is not a string'$q$) = 0 then
    raise exception 'buff shape (a): the non-object / non-string arms are gone'; end if;
  -- Predecessors intact.
  if strpos(v_apply, 'buff_not_paid') = 0 or strpos(v_apply, 'c_buff_max_segments') = 0
     or strpos(v_apply, 'v_out := public.hr_state_of(v_uid, v_slot);') = 0 then
    raise exception 'buff shape (a): the patch was not additive — a predecessor block is gone'; end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') then
    raise exception 'buff shape (a): hr_apply is executable by a client role'; end if;

  begin
    select b.item_id into v_item from public.hr_item_buffs b order by b.item_id limit 1;
    if v_item is null then raise exception 'buff shape (b): FIXTURE — hr_item_buffs is empty'; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
      values (v_uid, 0, 0, 0, 10, 10, 1, now())
      on conflict (user_id, slot) do update set version = 1, buffs = '[]'::jsonb;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = 5;

    -- (b1) EVERY FORGED FIELD → bad_buff_shape, with the bag and the queue unmoved.
    for v_r in select x from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('item', v_item, 'until', '2099-01-01T00:00:00Z'),
        jsonb_build_object('item', v_item, 'magnitude', 9999),
        jsonb_build_object('item', v_item, 'type', 'damage'),
        jsonb_build_object('item', v_item, 'duration_ms', 86400000),
        jsonb_build_object('item', v_item, 'scale', 1000))) as t(x)
    loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
               jsonb_build_object('buff_apply', v_r,
                                  'items', jsonb_build_object(v_item, -1), 'journal', c_j));
      if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'bad_buff_shape'
         or v_r->>'why' <> 'forbidden_key' then
        raise exception 'buff shape (b1): a forged buff field was not refused as bad_buff_shape/'
                        'forbidden_key — got %', v_r;
      end if;
    end loop;
    if (select buffs from public.player_state where user_id = v_uid and slot = 0) <> '[]'::jsonb then
      raise exception 'buff shape (b1): a refused forgery wrote the queue'; end if;
    if (select qty from public.player_inventory
         where user_id = v_uid and slot = 0 and item_id = v_item) <> 5 then
      raise exception 'buff shape (b1): a refused forgery ate the food'; end if;

    -- (b2) AN UNKNOWN ITEM STILL ANSWERS bad_buff_item. The split must not turn an
    --      ordinary stale-catalogue refusal into a forgery incident.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', 'no_such_item_at_all'),
                                'journal', c_j));
    if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'bad_buff_item' then
      raise exception 'buff shape (b2): an unknown item no longer answers bad_buff_item: %', v_r; end if;

    -- (b3) A REAL ITEM WITH NO BUFF — the other honest path — also stays.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item',
               (select i.item_id from public.hr_items i
                 where not exists (select 1 from public.hr_item_buffs b where b.item_id = i.item_id)
                 order by i.item_id limit 1)), 'journal', c_j));
    if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'bad_buff_item' then
      raise exception 'buff shape (b3): a real item with no buff no longer answers bad_buff_item: %', v_r;
    end if;

    -- (b4) AND THE HONEST PAID CONSUME STILL WORKS — a split that refused
    --      everything would pass every assertion above.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'buff shape (b4): the honest paid consume was refused: %', v_r; end if;

    raise exception using errcode = 'HR828', message = 'buff-shape-code §2 complete — rolling back';
  exception when sqlstate 'HR828' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'buff shape: §2 LEAKED a probe row'; end if;

  raise notice 'buff-shape-code PASSED: every forged buff field (until/magnitude/type/duration_ms/scale) '
               'is refused bad_buff_shape/forbidden_key with the queue and the bag unmoved; an unknown '
               'item and a real item with no buff both still answer bad_buff_item; the honest paid '
               'consume still applies; bad_buff_shape is a release code; no predecessor block was eaten '
               'and no client role can execute hr_apply';
end $mig$;
