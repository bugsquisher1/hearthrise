-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-18-invite-refusal-words.sql — THE INVITE REFUSAL IN PLAIN AMERICAN ENGLISH
--   (lane/c-copy-server, game-designer, 2026-11-06). The Discord playtest flamed the wording (Tyler 2026-11-05: "we
--   are getting absolutely flamed for the wording"); the client sweep (v0.2.100, tests/copy-lint.mjs) cannot read SQL.
--   A player who types a wrong invite code reads ONE refusal built by two copy functions, and both halves broke the
--   rules: hr_beta_gate_message's "That invite code was not recognised. Check it for typos — codes look like FRIEND-001
--   — or ask in the Discord." (two em dashes, a British spelling), then, with the gate open as it is on production
--   (hr_settings.beta_gate 'off', 2027-02-10-playtest-open.sql), hr_beta_signup_message's hint "You can also leave the
--   invite code blank — Hearthrise is open to everyone right now." GoTrue hands the joined string straight to the browser.
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA:
-- applies on its passing §2. ORDER: after the pace batch (2027-03-15/-16) and 2027-03-17; nothing depends on it.
--
-- WHAT MOVES: the two copy functions' sentences, nothing else. Each body is restated as it stood with only its words
-- changed: the reason codes, the gate, the hook, the throttle sentence, the delegation and both revokes are as they were.
-- No table, no grant change. Not a money, ranked or authority surface.
--
-- NOT HERE, ON PURPOSE: the house room offer names "Cellar — Root Cellar" in hr_unlock_offers. That em dash is a
-- field separator, not copy: the house section of hr_state_of splits it (split_part(name, ' — ', 1|2), 2026-11-29-
-- house-home.sql) into the room name and the rung name the House window shows apart ("Cellar", "Root Cellar"), and no
-- client surface renders the whole string. Changing it would mean restating hr_state_of for no word a player sees.
--
-- REVERSIBILITY: re-apply hr_beta_gate_message from 2026-08-23-beta-invite-gate.sql and hr_beta_signup_message from
-- 2026-08-23-open-beta.sql (their pre-image md5s are §0's).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  for v_r in select * from (values
    ('public.hr_beta_gate_message(text)', '378f8d14bbf22096d867294b895f172b', 'f67b0ec2003382c1f483958d1f4befe5'),
    ('public.hr_beta_signup_message(text)', '81919cf8f8fd975737db547bf97d8c57', 'e60d504a298d4775d76ccf657d2d28eb')) t(fn, pre, post) loop
    if to_regprocedure(v_r.fn) is null then
      raise exception 'PRECONDITION: % is absent: apply 2026-08-23-beta-invite-gate.sql and 2026-08-23-open-beta.sql first', v_r.fn;
    end if;
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its pre-image (%) nor this file''s image (%): md5 % - another file moved it, re-derive', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE COPY ─────────────────────────────────────────────────────────
-- Prose here and not machine codes is the original file's deliberate exception (GoTrue hands the string to the browser).
create or replace function public.hr_beta_gate_message(p_reason text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case p_reason
    when 'invite_required'  then 'Hearthrise is in closed beta. Enter the invite code you were sent to create an account.'
    when 'invite_unknown'   then 'That invite code was not recognized. Check it for typos (codes look like FRIEND-001), or ask in the Discord.'
    when 'invite_used'      then 'That invite code has already been used. Each code creates one account. If this was you, sign in instead.'
    when 'refused_throttled' then 'Too many invite attempts from this connection. Wait an hour and try again.'
    else 'That invite code cannot be used right now.'
  end
$$;
revoke execute on function public.hr_beta_gate_message(text) from public, anon, authenticated;

-- The delegate (2026-08-23-open-beta.sql §4), its words only: the open-gate hint is two sentences, not an em dash.
create or replace function public.hr_beta_signup_message(p_reason text)
returns text language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare v_msg text;
begin
  if p_reason = 'refused_signup_throttled' then
    return 'Too many accounts have been created from this connection today. '
        || 'Try again tomorrow, or ask in the Discord if you think this is wrong.';
  end if;
  v_msg := public.hr_beta_gate_message(p_reason);
  if public.hr_beta_gate_is_open() and p_reason in ('invite_unknown', 'invite_used') then
    -- The open-beta hint. Without it, a player who typed a code wrong is told
    -- to fix the code, when the thing they actually want to hear is that the
    -- field is optional.
    v_msg := v_msg || ' You can also leave the invite code blank. Hearthrise is open to everyone right now.';
  end if;
  return v_msg;
end $$;
revoke execute on function public.hr_beta_signup_message(text)
  from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (executed; any failure rolls the apply back) ──────────
do $chk$
declare v_r text; v_m text; v_src text;
begin
  -- (1) every sentence either function can hand a refused player: no em dash, no semicolon, no British "recognise"
  foreach v_r in array array['invite_required', 'invite_unknown', 'invite_used', 'refused_throttled', 'refused_signup_throttled', 'anything_else'] loop
    foreach v_m in array array[public.hr_beta_gate_message(v_r), public.hr_beta_signup_message(v_r)] loop
      if v_m is null or length(v_m) < 20 then
        raise exception 'SELF-CHECK 1 FAILED: the % message is empty or cut: %', v_r, v_m; end if;
      if position(chr(8212) in v_m) > 0 or position(';' in v_m) > 0 or v_m ilike '%recognis%' then
        raise exception 'SELF-CHECK 1 FAILED: the % message breaks the copy rules (em dash, semicolon or British spelling): %', v_r, v_m; end if;
    end loop;
  end loop;
  -- (2) the hint is written as two sentences whatever the switch reads today (the open gate is production's state)
  select prosrc into v_src from pg_proc where oid = to_regprocedure('public.hr_beta_signup_message(text)');
  if position(chr(8212) in v_src) > 0 or position('leave the invite code blank. Hearthrise is open to everyone right now.' in v_src) = 0 then
    raise exception 'SELF-CHECK 2 FAILED: the open-gate hint still carries an em dash or lost its words'; end if;
  -- (3) the unknown-code sentence still tells the player what to do, and the delegate still carries it
  v_m := public.hr_beta_gate_message('invite_unknown');
  if position('not recognized' in v_m) = 0 or position('FRIEND-001' in v_m) = 0 or position('Discord' in v_m) = 0 then
    raise exception 'SELF-CHECK 3 FAILED: the invite_unknown message lost what a player acts on: %', v_m; end if;
  if position(v_m in public.hr_beta_signup_message('invite_unknown')) <> 1 then
    raise exception 'SELF-CHECK 3 FAILED: hr_beta_signup_message no longer starts with hr_beta_gate_message: %', public.hr_beta_signup_message('invite_unknown'); end if;
  -- (4) neither is client-executable
  if has_function_privilege('anon', 'public.hr_beta_gate_message(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_beta_gate_message(text)', 'execute')
     or has_function_privilege('anon', 'public.hr_beta_signup_message(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_beta_signup_message(text)', 'execute') then
    raise exception 'SELF-CHECK 4 FAILED: a beta copy function is client-executable'; end if;
end $chk$;
