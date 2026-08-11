-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — BUG REPORT RELAY (server-side Discord forwarding)
--
-- WHY THIS EXISTS
--   src/bug-report.js shipped a live Discord webhook URL as a client constant.
--   The repo is public and hearthrise.net is GitHub Pages serving that repo, so
--   the token was readable by anyone, in the bundle AND in git history. A
--   webhook token permits POST (fake reports), PATCH (rename) and DELETE
--   (destroy it) — and the failure mode of a bug reporter is SILENCE, so nobody
--   would notice reports had stopped arriving. Tyler has regenerated it; the new
--   value lives ONLY as a Supabase Edge Function secret and is never in source.
--
--   The webhook now sits behind the `bug-report-bridge` Edge Function. That
--   function must not be an open spam relay pointed at Tyler's Discord, so it
--   needs (a) a verified identity and (b) a durable per-user rate limit. A
--   counter in Edge memory is not durable — isolates recycle and scale out — so
--   the counter is the `bug_reports` table itself, read under a per-user
--   advisory lock inside the SECURITY DEFINER RPC below.
--
-- THE DIVISION OF LABOUR (architectural law: Edge Functions never write tables)
--   Edge decides WHAT should happen (parse, bound, format, forward).
--   Postgres decides WHETHER IT MAY (identity, rate, idempotency) and is the
--   only writer. The Edge Function forwards to Discord only after this RPC has
--   returned `relay: true`.
--
-- ATTRIBUTION IS SERVER-DERIVED
--   The old client payload carried `user: <email or G.playerName>` and the old
--   Discord embed printed it verbatim — the same class of bug as a client-set
--   `from_name` in chat. This RPC ignores any client identity entirely: the row
--   is stamped with auth.uid() and the name the relay prints is read from
--   public.profiles here, not from the request body.
--
-- Idempotent and ADDITIVE. Creates no table; adds two columns and two indexes
-- to public.bug_reports, tightens one INSERT policy, adds one RPC.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions ─────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.bug_reports') is null then
    raise exception 'public.bug_reports is missing — run supabase/schema.sql first';
  end if;
end $$;

-- ── 1. Idempotency + provenance columns ──────────────────────────────────
-- `idem_key` is client-generated (crypto.randomUUID) and is the ONLY client
-- value here that is load-bearing; it is not trusted for anything except
-- collapsing a replay of the SAME user's own submit. Scoped per user, so one
-- player cannot suppress another's report by guessing a key.
alter table public.bug_reports
  add column if not exists idem_key text,
  add column if not exists source   text not null default 'client';

do $$ begin
  alter table public.bug_reports add constraint bug_reports_source_chk
    check (source in ('client','relay','import'));
exception when duplicate_object then null; end $$;

create unique index if not exists bug_reports_idem_idx
  on public.bug_reports (user_id, idem_key) where idem_key is not null;

-- The rate window reads (user_id, created_at desc). Without this index the
-- relay's hot path is a seq scan on a table that only ever grows.
create index if not exists bug_reports_user_recent_idx
  on public.bug_reports (user_id, created_at desc);

-- ── 2. The direct-insert fallback stops accepting a forged author ────────
-- The live policy was `with check (auth.uid() is not null)` — any signed-in
-- caller could insert a row attributed to ANY user_id, or to nobody. The client
-- already sends its own id, so this is a tightening with no client change.
drop policy if exists "bugs anyone submits" on public.bug_reports;
create policy "bugs anyone submits" on public.bug_reports
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ── 3. bug_report_submit — the only gate the relay trusts ────────────────
-- Returns jsonb. Error taxonomy (stable — the Edge Function maps these to HTTP):
--   {ok:true,  status:'accepted',  report_id, display_name, relay:true}
--   {ok:true,  status:'duplicate', report_id, display_name, relay:false}
--   {ok:false, status:'rate_limited', retry_after_s, scope:'hour'|'day'}
--   {ok:false, status:'unauthenticated'}
--   {ok:false, status:'bad_request'}
--
-- CONCURRENCY. Count-then-insert is a read-modify-write, so two simultaneous
-- submits could both observe 5/6 and both insert. A transaction-scoped advisory
-- lock keyed on the caller serialises one user's submits without touching
-- anybody else's. The lock is released at commit; no unlock path to leak.
--
-- CAPS are deliberately generous for a human and hostile to a script: a real
-- session produces one or two reports. 6/hour, 20/day.
create or replace function public.bug_report_submit(
  p_summary     text,
  p_description text default null,
  p_build       text default null,
  p_state       jsonb default null,
  p_errors      jsonb default null,
  p_idem_key    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_hour_cap    constant int := 6;
  c_day_cap     constant int := 20;
  c_summary_max constant int := 200;
  c_desc_max    constant int := 4000;
  c_build_max   constant int := 64;
  c_json_max    constant int := 16384;   -- bytes, per jsonb column
  c_err_max     constant int := 20;      -- console entries kept
  v_uid      uuid := auth.uid();
  v_summary  text;
  v_desc     text;
  v_build    text;
  v_state    jsonb;
  v_errors   jsonb;
  v_idem     text;
  v_name     text;
  v_id       bigint;
  v_hour     int;
  v_day      int;
  v_oldest   timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'status', 'unauthenticated');
  end if;

  -- Server-side bounds. The Edge Function bounds the request too, but a bound
  -- that only exists in the caller is not a bound.
  v_summary := nullif(btrim(coalesce(p_summary, '')), '');
  if v_summary is null then
    return jsonb_build_object('ok', false, 'status', 'bad_request', 'detail', 'summary_required');
  end if;
  v_summary := left(v_summary, c_summary_max);
  v_desc    := left(coalesce(p_description, ''), c_desc_max);
  v_build   := left(coalesce(p_build, ''), c_build_max);
  v_idem    := nullif(left(btrim(coalesce(p_idem_key, '')), 64), '');

  v_state := case
    when p_state is null or jsonb_typeof(p_state) <> 'object' then '{}'::jsonb
    when octet_length(p_state::text) > c_json_max then jsonb_build_object('_truncated', true)
    else p_state end;

  v_errors := case
    when p_errors is null or jsonb_typeof(p_errors) <> 'array' then '[]'::jsonb
    else (select coalesce(jsonb_agg(e), '[]'::jsonb)
            from (select e from jsonb_array_elements(p_errors) e limit c_err_max) s)
  end;
  if octet_length(v_errors::text) > c_json_max then
    v_errors := jsonb_build_array(jsonb_build_object('level', 'truncated', 'msg', 'errors payload too large'));
  end if;

  -- Serialise this caller's submits before the count.
  perform pg_advisory_xact_lock(hashtextextended('hr:bug_report:' || v_uid::text, 0));

  -- Idempotent replay: the same user re-sending the same key gets the same row
  -- back and NO relay, so a retry can never double-post to Discord.
  if v_idem is not null then
    select id into v_id from public.bug_reports
      where user_id = v_uid and idem_key = v_idem;
    if v_id is not null then
      select display_name into v_name from public.profiles where id = v_uid;
      return jsonb_build_object('ok', true, 'status', 'duplicate',
        'report_id', v_id, 'display_name', coalesce(v_name, 'player'), 'relay', false);
    end if;
  end if;

  select count(*) into v_hour from public.bug_reports
    where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_hour >= c_hour_cap then
    select min(created_at) into v_oldest from public.bug_reports
      where user_id = v_uid and created_at > now() - interval '1 hour';
    return jsonb_build_object('ok', false, 'status', 'rate_limited', 'scope', 'hour',
      'retry_after_s', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::int));
  end if;

  select count(*) into v_day from public.bug_reports
    where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_day >= c_day_cap then
    select min(created_at) into v_oldest from public.bug_reports
      where user_id = v_uid and created_at > now() - interval '24 hours';
    return jsonb_build_object('ok', false, 'status', 'rate_limited', 'scope', 'day',
      'retry_after_s', greatest(1, ceil(extract(epoch from (v_oldest + interval '24 hours' - now())))::int));
  end if;

  insert into public.bug_reports
    (user_id, build_version, summary, description, state, errors, idem_key, source, created_at)
  values
    (v_uid, v_build, v_summary, v_desc, v_state, v_errors, v_idem, 'relay', now())
  returning id into v_id;

  -- Attribution is READ, never accepted. profiles is the name authority.
  select display_name into v_name from public.profiles where id = v_uid;

  return jsonb_build_object('ok', true, 'status', 'accepted',
    'report_id', v_id, 'display_name', coalesce(v_name, 'player'),
    'relay', true, 'reports_this_hour', v_hour + 1);
end $$;

-- ── 4. Grants: revoke before granting (2026-08-11 lockdown discipline) ───
revoke execute on function public.bug_report_submit(text, text, text, jsonb, jsonb, text)
  from public, anon, service_role;
grant execute on function public.bug_report_submit(text, text, text, jsonb, jsonb, text)
  to authenticated;

comment on function public.bug_report_submit(text, text, text, jsonb, jsonb, text) is
  'Stores a bug report for auth.uid() under a per-user hour/day cap and an idempotency key. Returns relay:true exactly once per accepted report; the bug-report-bridge Edge Function forwards to Discord only on relay:true. Never accepts a client identity.';

-- ── 5. Self-verification — assert the load-bearing properties ────────────
do $$
declare
  v_check text;
begin
  -- (a) The RPC exists and is client-callable ONLY as `authenticated`.
  if not has_function_privilege('authenticated',
        'public.bug_report_submit(text,text,text,jsonb,jsonb,text)', 'execute') then
    raise exception 'bug_report_submit is not callable by authenticated — the relay cannot store anything';
  end if;
  if has_function_privilege('anon',
        'public.bug_report_submit(text,text,text,jsonb,jsonb,text)', 'execute') then
    raise exception 'bug_report_submit is anon-callable — an unauthenticated spam path exists';
  end if;

  -- (b) The direct-insert fallback can no longer forge an author.
  select pg_get_expr(polwithcheck, polrelid) into v_check
    from pg_policy where polrelid = 'public.bug_reports'::regclass
      and polname = 'bugs anyone submits';
  if v_check is null or v_check !~ 'uid\(\)\s*=\s*user_id' then
    raise exception 'bug_reports INSERT policy does not pin user_id to auth.uid() — got %', coalesce(v_check, '<none>');
  end if;

  -- (c) There is still NO client UPDATE or DELETE policy on bug_reports.
  if exists (select 1 from pg_policy where polrelid = 'public.bug_reports'::regclass
               and polcmd in ('w','d')) then
    raise exception 'bug_reports has a client UPDATE/DELETE policy — reports must be append-only';
  end if;

  -- (d) The idempotency index exists, or a retry double-posts to Discord.
  if to_regclass('public.bug_reports_idem_idx') is null then
    raise exception 'bug_reports_idem_idx is missing — replays would not collapse';
  end if;

  raise notice 'BUG REPORT RELAY OK — RPC authenticated-only, author pinned, append-only, idempotent';
end $$;
