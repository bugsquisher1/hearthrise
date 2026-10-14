-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — HUNT SESSIONS: AUTO-EAT AND THE COMBAT CREDIT LOSE THEIR READERS
-- (lane C2, ruling HR-2026-10-14 §3 "Delete").
-- STAGED, NOT APPLIED — REVIEW ONLY. Lane C: Security GO, then the Coordinator
-- applies (tools/apply-migration.mjs, one file). Applies AFTER
-- 2026-10-22-hunt-sessions-settle.sql and IMMEDIATELY BEFORE
-- 2026-10-22-hunt-sessions-drop-away.sql (C1), whose §1 refuses while any
-- function body still names an object it drops. CLIENT HALF: lane R1 (the
-- Auto-Eat UI stops reading the projection keys this file removes) ships with
-- or before this apply.
--
-- ⚠ SWAP THEN DELETE (designer loop check, 2026-10-14): GATHERING AND THE
--   BENCHES STILL WRITE AND READ THE "WHILE YOU WERE AWAY" RECEIPT until lane G
--   gives them sessions. `last_away_receipt` (the hr_apply key, its (4a-r)
--   validation, its SET write, the hr_state_of projection) and the edge's
--   away-receipt.js STAY. Only the COMBAT edge stopped sending one: a fight is
--   a hunt session, whose own timeline and Analyzer are its record.
--
-- ── WHAT IT REMOVES, AND FROM WHERE ─────────────────────────────────────────
--   hr_apply        · the death row's `auto_eat_enabled` meta key (Auto-Eat
--                     became the hunt's action bar; the edge stopped sending it)
--   hr_state_of     · state.auto_eat_enabled / _food / _pct / auto_eat_touched
--   hr_create_character · the bootstrap's Auto-Eat switch-on (the columns go)
--   hr_trait_buy__ungated · §(10)'s call to hr_set_auto_eat (it is dropped);
--                     the answer's `auto_eat` key is null from here on
-- Each is an ANCHORED EDIT of the installed body: the anchor must match
-- EXACTLY ONCE or the file raises, and a body already edited is left alone.
-- Nothing else in any body moves.
--
-- RESTATEMENT-DEBT-ACK: hr_apply is a 176 KB body already several anchored
--   patches past its 2026-09-14 restatement; this is one DELETION of a
--   feature the ruling retires (no new logic is added to the chain), anchored
--   exactly once and proven by §5's execution and by the drop file's
--   own reader scan. Restating 176 KB to delete one line is the riskier
--   change; the restatement belongs to the slice-7 queue, not to this lane.
--
-- ── MONEY ───────────────────────────────────────────────────────────────────
--   None. Every removed line DESCRIBED value (a setting, a meta
--   key); no clamp, balance or conservation term is touched. §5 asserts a
--   gold + item + death apply still lands and journals.
--
-- ⚠ AFTER APPLYING: live-hash-drift --live --write (hr_apply, hr_state_of,
--   hr_create_character, hr_trait_buy__ungated) and re-pin
--   tests/no-client-copy-of-projection.baseline.json's state keys.
-- REVERSIBILITY: re-apply the four bodies from the installed pre-images
--   (pg_get_functiondef) taken before the apply; the columns still exist until
--   the drop file runs, so nothing is lost by this file alone.
-- No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)') is null then
    raise exception 'PRECONDITION: 2026-10-22-hunt-sessions-settle.sql is not applied — the hunt settle must exist before Auto-Eat and the away receipt go';
  end if;
end $mig$;

-- ── §1 hr_apply ────────────────────────────────────────────────────────────
do $mig$
declare
  v_def text; v_n int;
  c_death constant text := $a$             'auto_eat_enabled', coalesce((v_death->>'auto_eat_enabled')::boolean, false),
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_n := (length(v_def) - length(replace(v_def, c_death, ''))) / length(c_death);
  if v_n = 0 then raise notice 'hr_apply already journals no Auto-Eat death key — edit skipped'; return; end if;
  if v_n <> 1 then
    raise exception 'hr_apply: the Auto-Eat death-key anchor matched % times (need exactly 1) — the body moved; re-derive it', v_n;
  end if;
  execute replace(v_def, c_death, '');
  raise notice 'hr_apply: the death row''s auto_eat_enabled removed (the away receipt stays for gathering)';
end $mig$;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── §2 hr_state_of ─────────────────────────────────────────────────────────
do $mig$
declare
  v_def text; v_n int; a text;
  c_lines constant text[] := array[
    $a$      'auto_eat_enabled', v_st.auto_eat_enabled,
$a$,
    $a$      'auto_eat_food', v_st.auto_eat_food,
$a$,
    $a$      'auto_eat_pct', v_st.auto_eat_pct,
$a$,
    $a$      'auto_eat_touched', (v_st.auto_eat_set_at is not null),
$a$];
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if not exists (select 1 from unnest(c_lines) x where strpos(v_def, x) > 0) then
    raise notice 'hr_state_of already projects no Auto-Eat key — edit skipped'; return;
  end if;
  foreach a in array c_lines loop
    v_n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
    if v_n <> 1 then raise exception 'hr_state_of: projection anchor % matched % times (need 1)', left(a, 40), v_n; end if;
    v_def := replace(v_def, a, '');
  end loop;
  execute v_def;
end $mig$;
revoke execute on function public.hr_state_of(uuid, int) from public;
revoke execute on function public.hr_state_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── §3 hr_create_character ─────────────────────────────────────────────────
do $mig$
declare
  v_def text; v_n int;
  c_upd constant text := $a$  update public.player_state
     set auto_eat_enabled = true,
         auto_eat_pct     = public.hr_auto_eat_max_pct(
                              public.hr_auto_eat_tier(v_uid, v_slot))
   where user_id = v_uid and slot = v_slot;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_create_character(int)'::regprocedure), chr(13), '');
  v_n := (length(v_def) - length(replace(v_def, c_upd, ''))) / length(c_upd);
  if v_n = 0 then raise notice 'hr_create_character already switches nothing on — edit skipped'; return; end if;
  if v_n <> 1 then raise exception 'hr_create_character: the Auto-Eat switch-on matched % times', v_n; end if;
  execute replace(v_def, c_upd, '');
end $mig$;

-- ── §4 hr_trait_buy__ungated ───────────────────────────────────────────────
do $mig$
declare
  v_def text; v_n int;
  c_call constant text := $a$  if v_cat.auto_enable then
    begin
      v_ae := public.hr_set_auto_eat(v_slot, true, null, null, false);
    exception when others then
      v_ae := jsonb_build_object('ok', false, 'error', 'enable_failed');
    end;
  end if;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_trait_buy__ungated(text,int,uuid)'::regprocedure), chr(13), '');
  v_n := (length(v_def) - length(replace(v_def, c_call, ''))) / length(c_call);
  if v_n = 0 then raise notice 'hr_trait_buy__ungated already calls no Auto-Eat writer — edit skipped'; return; end if;
  if v_n <> 1 then raise exception 'hr_trait_buy__ungated: the hr_set_auto_eat call matched % times', v_n; end if;
  execute replace(v_def, c_call, '');
end $mig$;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ─────────────────
do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-0000000c2a01';
  v_r   jsonb;
  v_v   bigint;
  v_readers text;
  v_h   jsonb;
begin
  -- (a) NO BODY STILL NAMES A DROPPED OBJECT (the drop file's own scan: the
  --     away receipt and hr_offline_cap_ms are NOT on it — gather keeps both
  --     until lane G).
  select string_agg(distinct p.oid::regprocedure::text || ' -> ' || o.obj, '; ')
    into v_readers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
         unnest(array['auto_eat_enabled', 'auto_eat_food', 'auto_eat_pct', 'auto_eat_set_at',
                      'hr_credit_kills', 'hr_set_auto_eat', 'hr_attended_kills']) o(obj)
   where n.nspname = 'public'
     and p.proname not in ('hr_set_auto_eat', 'hr_credit_kills', 'hr_credit_kills__ungated', 'hr_attended_kills',
                           'hr_rpc_gate', 'hr_assert_grant_hygiene', 'hr_vigour_of')
     and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g') ~ ('\m' || o.obj || '\M');
  if v_readers is not null then raise exception 'GATE(a): still read by %', v_readers; end if;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HRC2A ──────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(b): no probe character: %', v_r; end if;
    perform set_config('request.jwt.claim.sub', '', true);
    -- (b) THE ENVELOPE no longer carries the Auto-Eat keys — and STILL carries
    --     the away receipt gathering reads (swap then delete, lane G).
    v_r := public.hr_state_of(v_uid, 0);
    if (v_r->'state') ?| array['auto_eat_enabled', 'auto_eat_food', 'auto_eat_pct', 'auto_eat_touched'] then
      raise exception 'GATE(b): hr_state_of still projects an Auto-Eat key'; end if;
    if not ((v_r->'state') ? 'last_away_receipt') then
      raise exception 'GATE(b): hr_state_of lost last_away_receipt — gathering''s "while you were away" card reads it'; end if;
    -- (c) a gold + item + death apply still lands, its death row carries no
    --     Auto-Eat key, and the receipt key is STILL ON THE ALLOWLIST (an
    --     explicit void is accepted, not refused unknown_delta_key).
    select version into v_v from public.player_state where user_id = v_uid and slot = 0;
    set local role hr_engine;
    v_r := public.hr_apply(v_uid, 0, v_v, gen_random_uuid(),
             jsonb_build_object('gold', 7, 'items', jsonb_build_object('bones', 2),
                                'last_away_receipt', null,
                                'deaths', jsonb_build_array(jsonb_build_object('monster', 'rat', 'recovery_ms', 0,
                                  'deaths_today', 1, 'deaths_lifetime', 1, 'resume_hp', 4, 'food_in_bag', false)),
                                'accrued_to', to_jsonb(now()),
                                'journal', jsonb_build_object('kind', 'admin', 'intent', 'c2a_probe')));
    reset role;
    if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'GATE(c): an ordinary apply answered %', v_r; end if;
    if (select meta ? 'auto_eat_enabled' from public.player_ledger
         where user_id = v_uid and kind = 'combat' and intent = 'death' order by id desc limit 1) then
      raise exception 'GATE(c): the death row still journals auto_eat_enabled'; end if;
    raise exception using errcode = 'HRC2A', message = 'hunt-sessions-away-readers §5 complete — rolling back';
  exception when sqlstate 'HRC2A' then null;
  end;
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE(z): §5 LEAKED a probe row'; end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;
  raise notice 'hunt-sessions-away-readers: EXECUTED - no body reads the Auto-Eat columns / hr_credit_kills / '
               'hr_set_auto_eat, the envelope no longer projects Auto-Eat and still projects the away receipt, '
               'an ordinary apply lands; net zero';
end $$;
