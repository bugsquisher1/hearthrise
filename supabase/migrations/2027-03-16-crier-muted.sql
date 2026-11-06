-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-16-crier-muted.sql — A MUTED PLAYER'S TOWN CRIER SAYS WHY, BEFORE ANYTHING MOVES (lane/c-small-1106, systems-engineer, 2026-11-06;
--   found by lane/c-gm-tools).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its passing §4;
-- ON THE EA SECURITY LIST with the Crier (money). EDGE: none. CLIENT: the Crier tab reads `muted_until` and rides the next release AFTER this applies
-- (an older tab ignores the key; a newer tab before the apply finds none and the press is refused by the server as before).
--
-- THE BUG. hr_crier_send never read the mute: a muted player's press passed every gate, paid, and then the chat row's lock (hr_chat_zgm_gate) RAISED
-- 'muted' at the insert. The whole purchase rolled back (nothing was charged), but the answer was a raised error, not a refusal: no hr_note_rejection
-- row, no `until`, and the tab could not know before the press.
--
-- §1 hr_crier_send, ONE SPLICE: the mute is refused after the replay and the flag, before the rule, the words, the buckets and the charge, as
--    {ok:false, error:'muted', until}, noted like every other refusal. hr_chat_zgm_gate stays the second lock (a mute that lands mid-press rolls back whole).
-- §2 hr_town_crier_quote, ONE SPLICE: `muted_until`, the mute's end while one stands, else null. The window's read (hr_town_sinks_view), never the envelope.
--
-- COST: one primary-key probe of hr_chat_mutes per press and per quote. No table, no grant, no client verb. Rows: none.
-- REVERSIBILITY: re-apply 2027-02-27-town-crier.sql's two bodies. No data.
-- ORDER: after 2027-03-13-gm-tools.sql (hr_chat_muted_until); no object in common with any later file. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_crier_send(integer,text,bigint,uuid)') is null or to_regprocedure('public.hr_town_crier_quote(uuid)') is null then
    raise exception 'PRECONDITION: apply 2027-02-27-town-crier.sql first'; end if;
  if to_regprocedure('public.hr_chat_muted_until(uuid)') is null then raise exception 'PRECONDITION: apply 2027-03-13-gm-tools.sql first'; end if;
end $mig$;

-- ── §1 THE VERB SAYS THE MUTE FIRST ──────────────────────────────────────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_crier_send(integer,text,bigint,uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CRIER-MUTED') = 0 then
    v_old := $a$  select * into v_rule from public.hr_sink_rules where sink_id = 'crier';
$a$;
    v_new := $a$  -- CRIER-MUTED (2027-03-16-crier-muted.sql): a mute is said before the rule, the words or the charge; the row's lock stays the second one
  if public.hr_chat_muted_until(v_uid) is not null then
    return public.hr_note_rejection('crier', p_slot, jsonb_build_object('ok', false, 'error', 'muted', 'until', public.hr_chat_muted_until(v_uid))); end if;
$a$ || v_old;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_crier_send: CRIER-MUTED anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §2 THE QUOTE CARRIES IT ──────────────────────────────────────────────────
do $mig$
declare v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_town_crier_quote(uuid)'::regprocedure), chr(13), '');
  if strpos(v_def, 'CRIER-MUTED') = 0 then
    v_old := $a$'gap_s', r.gap_s, 'on', public.hr_flag_on('town_crier'),$a$;
    v_new := v_old || $a$
    -- CRIER-MUTED (2027-03-16-crier-muted.sql): when a standing mute ends, else null: the tab says why before a press
    'muted_until', public.hr_chat_muted_until(p_user),$a$;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> 1 then raise exception 'hr_town_crier_quote: CRIER-MUTED anchor matched % times (need 1): the body moved', v_n; end if;
    execute replace(v_def, v_old, v_new);
  end if;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000901d6d01';
  v jsonb; v_q jsonb; v_rows int;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'crier-muted §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'crier-muted §3: hr_create_character refused: %', v; end if;
    update public.player_state set level_xp = public.hr_char_xp_for_level(12) where user_id = v_u and slot = 0;
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    delete from public.hr_rate_counters where user_id = v_u;
    insert into public.hr_chat_mutes (user_id, until, at) values (v_u, now() + interval '1 hour', now());
    -- (a) a muted press is a refusal with its end, before the charge: no gold, no journal, no line, no spent key
    v := public.hr_crier_send(0, 'selling rat tails', 1000, '000000c0-0000-4000-a000-0000901d6d11');
    if v->>'error' is distinct from 'muted' or v->>'ok' <> 'false' or v->>'until' is null then raise exception 'crier-muted §3(a): a muted press answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_u) <> 1000000 then raise exception 'crier-muted §3(a): a muted press charged'; end if;
    select count(*) into v_rows from public.player_ledger where user_id = v_u and kind = 'shop';
    if v_rows <> 0 then raise exception 'crier-muted §3(a): a muted press journalled % row(s)', v_rows; end if;
    if exists (select 1 from public.chat_messages where from_id = v_u and crier) then raise exception 'crier-muted §3(a): a muted press posted a line'; end if;
    if exists (select 1 from public.player_intents where user_id = v_u and intent_id = '000000c0-0000-4000-a000-0000901d6d11') then
      raise exception 'crier-muted §3(a): a muted press spent its key'; end if;
    -- (b) the mute says so before the words: a web address from a muted player reads muted, not crier_link
    v := public.hr_crier_send(0, 'join discord.gg/x now', 1000, '000000c0-0000-4000-a000-0000901d6d12');
    if v->>'error' is distinct from 'muted' then raise exception 'crier-muted §3(b): a muted web address answered %', v; end if;
    -- (c) the quote says it before a press
    v_q := public.hr_town_crier_quote(v_u);
    if v_q->>'muted_until' is null then raise exception 'crier-muted §3(c): the quote of a muted account reads %', v_q; end if;
    -- (d) lifted: the quote reads null and the same press pays
    delete from public.hr_chat_mutes where user_id = v_u;
    v_q := public.hr_town_crier_quote(v_u);
    if not (v_q ? 'muted_until') or v_q->>'muted_until' is not null then raise exception 'crier-muted §3(d): the quote of a free account reads %', v_q; end if;
    v := public.hr_crier_send(0, 'selling rat tails', 1000, '000000c0-0000-4000-a000-0000901d6d13');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'crier-muted §3(d): an unmuted press answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_u) <> 999000 then raise exception 'crier-muted §3(d): the purse reads wrong'; end if;
    -- (e) an expired mute is no mute
    insert into public.hr_chat_mutes (user_id, until, at) values (v_u, now() - interval '1 second', now() - interval '1 hour');
    if public.hr_town_crier_quote(v_u)->>'muted_until' is not null then raise exception 'crier-muted §3(e): an expired mute still reads'; end if;
    raise exception using errcode = 'HR940', message = 'crier-muted §3 complete - rolling back';
  exception when sqlstate 'HR940' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'crier-muted §3: LEAKED a probe row'; end if;
  -- (f) nothing a client reaches moved: the verb's grants, and the helpers stay the owner's
  if not has_function_privilege('authenticated', 'public.hr_crier_send(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_crier_send(integer,text,bigint,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_town_crier_quote(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_chat_muted_until(uuid)', 'execute') then
    raise exception 'crier-muted §3(f): a grant moved'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'crier-muted: a mute is refused before the charge, with its end, and the quote says it; all green';
end $chk$;
