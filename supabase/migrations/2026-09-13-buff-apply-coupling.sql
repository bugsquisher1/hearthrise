-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-buff-apply-coupling.sql — A BUFF MUST BE PAID FOR, IN THE SAME
--                                      DELTA, UNDER THE SAME LOCK.
--
-- F3 from the Security review of 2026-09-13-consumable-buffs.sql (GO on files 1
-- and 2, APPLIED 05:19 UTC; this is the named follow-up).
--
-- ── THE HOLE THIS CLOSES ───────────────────────────────────────────────────
-- As applied, `buff_apply = {item}` checks that the item HAS a buff (hr_item_buffs)
-- and nothing else. It never asks whether the character OWNS one. Nothing exploits
-- that today — the only emitter is step 2's eat path, which is not wired — but the
-- moment it is, the possession check would live in the EDGE FUNCTION, and an Edge
-- Function is not where a possession check may live: it is the layer that proposes,
-- not the layer that holds the row lock. A compromised or merely stale engine could
-- post `{buff_apply:{item:'moonbloom_elixir'}}` with no debit and buff a character
-- who has never cooked one — infinite Feasts, server-authored, with a clean ledger.
--
-- ── THE RULE, AND WHY IT IS THE DEBIT RATHER THAN A SEPARATE READ ──────────
--     a `buff_apply` for item X is REFUSED `buff_not_paid` unless the SAME delta
--     carries `items[X] = -1`.
--
-- Not "unless the player has one" — unless the player is SPENDING one, here, in
-- this delta. The two are different controls and only the second is sound:
--   · a bare `exists (select … player_inventory)` read is a TOCTOU invitation and,
--     worse, it makes the buff FREE — you would buff off a stack you keep.
--   · the `items` block already IS the possession check, and a rigorous one: it
--     refuses an unknown id, clamps the magnitude, takes `for update` on the row
--     and refuses `insufficient_item` when `have + delta < 0`
--     (2026-08-11-apply-engine.sql). Coupling to it means ONE check, already
--     locked, already journalled, already atomic with the buff it pays for.
-- So this file adds no inventory logic at all. It adds a COUPLING: the buff and
-- its cost cannot be separated, because hr_apply is all-or-nothing and the delta
-- must contain both or be refused.
--
-- EXACTLY -1, not "any negative". A buff is one serving; nothing in the design
-- eats two pies for one effect, and `-2` would either mean a second buff the
-- merge rules never saw or a double debit. A future "eat three at once" is a
-- design change and must arrive as one, not as a loose comparison here.
--
-- ── WHAT IT IS NOT ────────────────────────────────────────────────────────
-- It does not make the buff cheaper, dearer, longer or stronger. It adds no
-- ledger row (the apply row already names both delta keys in `meta.k`, so a paid
-- buff is identifiable; one row per eaten pie is the game_events mistake at
-- ledger scale). It does not touch the merge rules, the cap, the `buff_at_max`
-- fuse, or the projection. It reads NOTHING new from the client: the only field
-- consulted is the `items` entry for the item id the delta already named, and
-- every value in it is re-validated by the block that owns it.
--
-- `buff_not_paid` is a RELEASE CODE. Nothing was written (hr_reject raises and the
-- block rolls back) and the honest client response is "send the debit too", which
-- is the same intent with the same key — withholding the key would brick it for
-- up to 25 hours over an engine bug a redeploy fixes.
--
-- RESTATEMENT-DEBT-ACK: this is a one-anchor insert into the LIVE hr_apply body,
--   which the Coordinator applied at 05:19 UTC (md5 ad292371…, 142,480 normalised
--   bytes) and which an agent cannot read (tools/apply-migration.mjs and
--   tests/live-hash-drift.baseline.json are Coordinator-only). Both anchors are
--   text THIS LANE authored one migration ago, so they are the one part of that
--   body this file can account for line by line; a restatement would blind-
--   overwrite 26 patches of other people's work on the economy's single write
--   path (the b484-b487 class). The paydown — restate hr_apply ONCE from
--   pg_get_functiondef of the LIVE body, then re-pin live-hash-drift — stays the
--   Coordinator's, scheduled.
--
-- COST AT 100× PLAYERS: two jsonb lookups on a delta already in memory, inside a
-- block that runs at most once per apply. No table, no column, no index, no row,
-- no extra write. Reversible by re-applying the previous last-toucher of hr_apply
-- (2026-09-13-consumable-buffs.sql), and behaviourally reversible by nothing at
-- all: step 2's eat path is written against this rule, so the only deltas it can
-- refuse are ones that should never have been proposed.
--
-- ⚠ AFTER APPLYING: hr_apply is LIVE-HASH-TRACKED and is patched PROGRAMMATICALLY
--   here — re-seed with `node tests/live-hash-drift.mjs --live --write` and write
--   the whys from `--codediff`.
-- ⚠ APPLY ORDER: after 2026-09-13-consumable-buffs.sql (§0 refuses to install
--   against a body that does not already carry the buff_apply block).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, ANCHORS EXACTLY ONCE ───────────────────
do $mig$
declare
  v_apply text; v_n int;
  c_a_codes constant text := $anc$    'bad_buff_item', 'buff_at_max',$anc$;
  c_a_clock constant text := $anc$      v_buff_now := now();$anc$;
begin
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply is missing — apply the apply-engine chain first'; end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'hr_reject is missing — apply the apply-engine chain first'; end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  -- The block this file couples TO must be there, or the coupling has nothing to
  -- attach to and a "success" would leave the hole exactly as it is.
  if strpos(v_apply, $q$if p_delta ? 'buff_apply' then$q$) = 0 then
    raise exception 'hr_apply does not handle buff_apply — apply 2026-09-13-consumable-buffs.sql first';
  end if;
  -- …and so must the items block, which IS the possession check this delegates to.
  -- A coupling to a debit path that does not refuse `insufficient_item` would be a
  -- control in name only.
  if strpos(v_apply, $q$if p_delta ? 'items' then$q$) = 0
     or strpos(v_apply, 'insufficient_item') = 0 then
    raise exception 'hr_apply has no items block that refuses insufficient_item — the debit is the '
                    'possession check this file relies on, and it is not there';
  end if;

  v_n := (length(v_apply) - length(replace(v_apply, c_a_codes, ''))) / length(c_a_codes);
  if v_n <> 1 then raise exception 'hr_apply: the buff release-code anchor appears % time(s), expected '
                                  'exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_clock, ''))) / length(c_a_clock);
  if v_n <> 1 then raise exception 'hr_apply: the server-clock anchor appears % time(s), expected '
                                  'exactly 1', v_n; end if;
end $mig$;

-- ── 1. THE PATCH ───────────────────────────────────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'buff_not_paid') > 0 then
    raise notice 'hr_apply already couples buff_apply to its debit — patch skipped'; return; end if;

  -- 1a. THE RELEASE CODE, beside its two siblings.
  v_def := replace(v_def,
    $anc$    'bad_buff_item', 'buff_at_max',$anc$,
    $anc$    'bad_buff_item', 'buff_at_max', 'buff_not_paid',$anc$);

  -- 1b. THE COUPLING, inserted AFTER the catalogue lookup (so an unknown or
  --     non-buff item still answers `bad_buff_item`, which is the more specific
  --     truth) and BEFORE the server clock is read (so a refused apply never
  --     reaches the merge at all).
  v_def := replace(v_def,
    $anc$      v_buff_now := now();$anc$,
    $anc$      -- ── (4a-b2) THE BUFF MUST BE PAID FOR (F3, Security 2026-09-13) ──────
      -- The SAME delta must spend exactly one of the item. The `items` block above
      -- is the possession check — it takes `for update` on the inventory row and
      -- refuses `insufficient_item` when the stack cannot cover the debit — so this
      -- is a COUPLING, not a second check: the buff and its cost are inseparable
      -- because hr_apply is all-or-nothing.
      --
      -- WHY NOT "does the player own one": a bare existence read is TOCTOU-prone
      -- AND makes the buff free (you would buff off a stack you keep). The debit is
      -- the only form of the question that is both locked and honest.
      --
      -- EXACTLY -1: a buff is one serving. `-2` would mean either a second buff the
      -- merge rules never saw or a double debit; "eat three at once" is a design
      -- change and must arrive as one. coalesce() on every jsonb_typeof because
      -- `null <> 'object'` is NULL, and an `if NULL then` does NOT refuse — the
      -- shape of a check that passes everything while reading like a control.
      if coalesce(jsonb_typeof(p_delta->'items'), '') <> 'object'
         or coalesce(jsonb_typeof(p_delta->'items'->v_buff_item), '') <> 'number'
         or (p_delta->'items'->>v_buff_item)::numeric <> -1 then
        perform public.hr_reject('buff_not_paid',
          jsonb_build_object('item', v_buff_item, 'need', -1,
                             'got', p_delta->'items'->v_buff_item));
      end if;

      v_buff_now := now();$anc$);

  execute v_def;
  raise notice 'hr_apply patched: buff_apply refuses buff_not_paid without items[<item>] = -1';
end $mig$;
-- create-or-replace preserves an ACL; re-state it anyway. If the browser could
-- call hr_apply it could author its own delta.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 2. SELF-CHECK (§4) — BY EXECUTION ──────────────────────────────────────
-- Both branches are DRIVEN: a bare buff_apply is refused and writes nothing, a
-- buff_apply WITH the debit applies and the item really leaves the bag. The probe
-- character is fabricated inside a subtransaction discarded by a sentinel raise
-- (HR826), so this block is net-zero on production.
do $mig$
declare
  v_apply text; v_r jsonb; v_ver bigint; v_q jsonb; v_qty bigint; v_item text; v_type text;
  v_uid  constant uuid := '000000b2-0000-0000-0000-0000000000b2';
  c_j    constant jsonb := '{"kind":"admin","intent":"buff-coupling:probe"}'::jsonb;
begin
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_apply, 'buff_not_paid') = 0 then
    raise exception 'buff coupling (a): the refusal did not install'; end if;
  if strpos(v_apply, $q$'bad_buff_item', 'buff_at_max', 'buff_not_paid',$q$) = 0 then
    raise exception 'buff coupling (a): buff_not_paid is not a release code — a client bug would brick '
                    'an idempotency key for 25 hours'; end if;
  if strpos(v_apply, $q$coalesce(jsonb_typeof(p_delta->'items'), '') <> 'object'$q$) = 0 then
    raise exception 'buff coupling (a): the absent-items arm is not coalesced — `null <> ''object''` is '
                    'NULL and the check would refuse NOTHING while reading like a control'; end if;
  -- The neighbours the splice could have eaten.
  if strpos(v_apply, $q$if p_delta ? 'buff_apply' then$q$) = 0
     or strpos(v_apply, 'v_buff_gain < v_buff_need') = 0
     or strpos(v_apply, $q$where t.bk <> 'item'$q$) = 0
     or strpos(v_apply, 'v_out := public.hr_state_of(v_uid, v_slot);') = 0 then
    raise exception 'buff coupling (a): the patch was not additive — a predecessor block is gone';
  end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') then
    raise exception 'buff coupling (b): hr_apply is executable by a client role';
  end if;

  begin
    select b.item_id, b.type into v_item, v_type
      from public.hr_item_buffs b order by b.item_id limit 1;
    if v_item is null then
      raise exception 'buff coupling (c): FIXTURE — hr_item_buffs is empty'; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
      values (v_uid, 0, 0, 0, 10, 10, 1, now())
      on conflict (user_id, slot) do update set version = 1, buffs = '[]'::jsonb;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, v_item, 2)
      on conflict (user_id, slot, item_id) do update set qty = 2;

    -- (c1) A BARE buff_apply IS REFUSED, and nothing moves.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
                           jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                              'journal', c_j));
    if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'buff_not_paid' then
      raise exception 'buff coupling (c1): a buff_apply with NO debit was not refused as buff_not_paid '
                      '— a stale engine could buff a character who owns nothing: %', v_r;
    end if;
    if (select buffs from public.player_state where user_id = v_uid and slot = 0) <> '[]'::jsonb then
      raise exception 'buff coupling (c1): the refused apply still wrote the queue'; end if;
    if (select qty from public.player_inventory
         where user_id = v_uid and slot = 0 and item_id = v_item) <> 2 then
      raise exception 'buff coupling (c1): the refused apply moved the inventory'; end if;

    -- (c2) THE WRONG QUANTITY IS REFUSED TOO — 0, -2 and a positive CREDIT.
    for v_qty in select q from unnest(array[0, -2, 1, 5]) q loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
                             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                                'items', jsonb_build_object(v_item, v_qty),
                                                'journal', c_j));
      if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'buff_not_paid' then
        raise exception 'buff coupling (c2): items[%] = % was accepted as payment for a buff (%)',
                        v_item, v_qty, v_r;
      end if;
    end loop;
    -- …and a debit of a DIFFERENT item does not pay for this one.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
                           jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                              'items', jsonb_build_object(
                                                (select i.item_id from public.hr_items i
                                                  where i.item_id <> v_item order by i.item_id limit 1), -1),
                                              'journal', c_j));
    if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' = 'buff_not_paid' then
      null;   -- either buff_not_paid or insufficient_item is correct; both refuse
    end if;
    if coalesce(v_r->>'ok', 'true') <> 'false' then
      raise exception 'buff coupling (c2): debiting a DIFFERENT item paid for the buff: %', v_r; end if;

    -- (c3) THE PAID FORM APPLIES, and the food really leaves the bag.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
                           jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                              'items', jsonb_build_object(v_item, -1),
                                              'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'buff coupling (c3): the PAID form was refused — the eat path would be dead: %', v_r;
    end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if jsonb_array_length(coalesce(v_q, '[]'::jsonb)) <> 1 or v_q->0->>'type' <> v_type then
      raise exception 'buff coupling (c3): the paid apply did not stamp the buff: %', v_q; end if;
    if (select qty from public.player_inventory
         where user_id = v_uid and slot = 0 and item_id = v_item) <> 1 then
      raise exception 'buff coupling (c3): the paid apply did not spend the food'; end if;

    -- (c4) AND THE DEBIT IS THE POSSESSION CHECK. With the stack gone, the same
    --      paid delta is refused by the ITEMS block — which is the whole reason
    --      this file delegates rather than adding a read of its own.
    delete from public.player_inventory where user_id = v_uid and slot = 0 and item_id = v_item;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
                           jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                              'items', jsonb_build_object(v_item, -1),
                                              'journal', c_j));
    if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'insufficient_item' then
      raise exception 'buff coupling (c4): a character with NONE of the food was still buffed (%) — the '
                      'debit is not acting as the possession check', v_r;
    end if;

    raise exception using errcode = 'HR826', message = 'buff-apply-coupling §2 complete — rolling back';
  exception when sqlstate 'HR826' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'buff coupling: §2 LEAKED a probe row'; end if;

  raise notice 'buff-apply-coupling PASSED: a buff_apply with no items[<item>] = -1 is refused '
               'buff_not_paid with the queue and the bag unmoved; 0, -2, +1, +5 and a different '
               'item''s debit are all refused; the PAID form applies and spends exactly one; a '
               'character who owns none is refused insufficient_item by the items block that owns '
               'the lock; buff_not_paid is a release code; no predecessor block was eaten; and no '
               'client role can execute hr_apply';
end $mig$;
