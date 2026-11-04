-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-25-account-delete.sql — A PLAYER CAN DELETE THEIR ACCOUNT: IT STOPS PLAYING AT ONCE, THEY HAVE
--   30 DAYS TO KEEP IT, AND THEN THE SERVER REMOVES IT (lane/c-account-delete, backend-architect, 2026-11-04).
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA:
-- applies on its passing §10. ON THE EA SECURITY LIST (CLAUDE.md §3.7): it is the one path that deletes from auth.users,
-- it adds a pass-through to the pre-request hook, and it opens the one admitted UPDATE on two append-only tables.
-- EDGE: none (hr_rate_gate refuses a leaving account with its existing line). CLIENT: rides the next release, after this.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_account_delete_request(p_confirm text, p_idem uuid) -> jsonb  (authenticated)
--   {ok:true, requested_at, purge_at} | {ok:false, error}. Who: auth.uid(), no id is taken from a client. When: now() + 30 days.
--   Errors: not_signed_in, bad_idem, rate_limited, bad_confirm (p_confirm <> 'DELETE'), stale_signin, already_kept.
--   A second request answers the first one's dates and never moves them. A retried key whose request was since kept is refused.
-- hr_account_keep(p_idem uuid) -> jsonb  (authenticated)
--   {ok:true, kept:true} | {ok:true, kept:false} (nothing was waiting) | {ok:false, error}: bad_idem, rate_limited, account_gone.
-- 403 {code:'hr_account_leaving', details:'<purge_at, ISO>'}: the pre-request hook's answer to every other Data-API call of
--   a leaving account, and hr_rpc_gate's. `details` because PostgREST keeps only code/message/details/hint from a raise.
-- hr_account_purge_run() (the job, no client): every 10 min. Sweeps every leaving account quiet, then purges what is due.
--
-- ── THE RE-CHECK: A FRESH PASSWORD SIGN-IN, READ FROM THE SIGNED TOKEN ──────
-- The client signs in again with the typed password, which mints a new session; the request refuses (stale_signin) unless
-- the token's own `amr` holds {method:'password'} within 5 minutes (Supabase JWT claims reference). Password, not session age:
-- a session left open on a shared computer must not be able to destroy an account, and `iat` moves on every refresh. The
-- value is the auth server's signature, not a client's word. A Keep needs only a session: stopping a deletion can't hurt.
--
-- ── WHAT HAPPENS TO WHAT ────────────────────────────────────────────────────
--   at the request (hr_account_quiet)     the account stops playing; nothing is destroyed; Keep undoes the waiting only
--     open hunts           end at their last settled boundary: bag home, hero home, end reason `left`, the pending window
--                          unpaid and journalled (window_forfeit). A party's partners hunt on: a forfeited seat sends nobody
--                          home (2027-01-22-party-settle-isolation.sql), the same rule as a kick.
--     parties              every hero leaves; the next seat leads; the seats left get a `left` notice; invites both ways go.
--     market listings      all come back to Storage now, journalled kind trade (the expiry sweep's shape); the fee stays burned.
--     town jobs            stop; each hero idles in town. Presence, town bodies and the play cap's claims go.
--     leaderboards         hidden (hr_lb_hidden 'leaving') from the next refresh.
--     friends, chat, names unchanged during grace, so a Keep finds them; the player can't send anything.
--   at the purge (hr_account_purge)       every row removed, per hr_account_person_columns()
--     auth.users           deleted, so sign-in fails, and its sessions and identities go by their foreign keys.
--     heroes, bags, gold, Storage, house, farm, skills, setups, hunt history: deleted (its foreign keys, then the sweep).
--     friends, blocks, friend asks, party notices, whispers both ways, whatever names them: deleted.
--     chat lines           their own, their rare-find announcements, and party lines addressed to them: deleted.
--     hero and display names: freed. A MODERATED name's hold stays with its owner cleared: it never returns to use.
--     allowlist row        goes by its foreign key: a new sign-up with that email is a new id, a stranger, and needs a new invite.
--   KEPT, ANONYMIZED, and why
--     player_ledger, player_ledger_rollup   append-only, every value movement. The rows keep their amounts, kinds, items and times
--                          under a RANDOM stand-in id; meta is emptied and intent cut to its verb (hero_rename:<name> held a name).
--                          Why: §1 says every shared-surface write is journalled. A player leaving doesn't rewrite the record
--                          of the economy other players were in, and a dispute can still be resolved from it.
--     market_sales         the counterparty's purchase or sale stands; the leaver's side becomes the stand-in.
--     beta_signup_log      append-only abuse trail, 180 days: IP, email domain and detail emptied, user cleared.
--     clans                they have no client in the rebuild: a clan stays with its next member, or goes with its last.
--   hearthfind_ordinal keeps its count, so a later finder's "Nth ever" is unaffected; market_item_daily names nobody.
--
-- ── WHO MAY DELETE FROM auth.users, AND HOW ─────────────────────────────────
-- ONE function, hr_account_purge, owned by `postgres`, EXECUTE revoked from everyone, called only from the pg_cron job, which
-- runs as postgres. `postgres` has held delete on auth.users since the chain began (self-checks since 2026-08-20 do it, and
-- §10 here does it again inside the apply, so a privilege lost since then fails the apply, not a player). NO SERVICE-ROLE KEY IS
-- INVOLVED ANYWHERE: nothing to paste, store or leak (CLAUDE.md §2), no network hop, no edge function.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- hr:account:<uid> advisory lock on request, keep, sweep and purge (the job takes it try-only and skips a busy account). The purge
-- re-reads the row under it: a Keep that won means nothing happens. Lock order is the verbs': party row, then instance, then
-- hero (hr_hunt_lock), then hr:depot. RACE, ACCEPTED AND SWEPT: a hunt-enter or a listing already past the gate when the request
-- commits can land after the request's own sweep. The job's sweep ends it within 10 minutes, so no extra lock sits in a hot path.
-- A long ledger is anonymized 50,000 rows a step ('more': the job resumes it next run), so a run stays short.
-- A failed purge rolls back its subtransaction, files a critical alert (no id in it) and is retried next run.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- +2 client RPCs, both keyed on auth.uid(): a forged id, price or name has nowhere to go; another account can't be named.
-- +1 own-row SELECT grant on hr_account_deletions (the invoker gates read it, like the allowlist).
-- The hook passes two exact paths; each runs one function with its own checks. A closed-mode account may ask to delete itself.
-- A hijacked session with the password can delete an account, and the owner can then keep it by signing in within 30 days.
-- hr_ledger_immutable and hr_beta_signup_log_immutable admit an UPDATE only when the transaction-local hr.account_purge names that
-- row's owner and the stand-in, and only of the anonymizing shape (all else equal). No client role holds UPDATE on either, and
-- no client can set that setting: PostgREST exposes no set_config and runs its one statement.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Stop purging: select public.hr_cron_drop('hr-account-purge'). Waiting accounts stay out until each keeps. A purged account comes
-- back only from the daily backup. Remove: restate hr_admitted, hr_access_check and the two immutables from their previous
-- images (the §0 pins), drop the verbs and the two tables. Nothing else moves.
--
-- COST (100x players): one more PK probe per REST request. A few rows per deletion in the log. The job: an empty read every 10
-- minutes; a purge is about 110 uuid-column scans, rare, and off the hot path. The ledger keeps its rows (it would anyway).
-- ORDER: after 2027-02-24-gold-matters-hero-slots.sql (the newest). No begin/commit.
-- AFTER APPLYING: restore-census classifies the two tables (done in this lane's commit); live-hash-drift wants the four restated
-- bodies. First live check: a spare account requests and keeps. A 403 on Keep means request.path reads differently than assumed.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regprocedure('public.hr_hunt_forfeit_seat(uuid,uuid,text,jsonb,integer)') is null
     or to_regprocedure('public.hr_party_drop(uuid,uuid,integer)') is null
     or to_regprocedure('public.hr_party_notice(uuid,integer,text,uuid,integer,text)') is null
     or to_regprocedure('public.hr_hunt_point(uuid,integer,text)') is null
     or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null
     or to_regclass('public.hr_lb_hidden') is null or to_regclass('public.hr_access_allowlist') is null then
    raise exception 'PRECONDITION: the hunt, party, leaderboard or closed-mode chain is absent'; end if;
  for r in select * from (values
    ('public.hr_access_check()', 'f272a1de5dd20c1f65467a3b205ca2c1'),
    ('public.hr_admitted(uuid)', 'ec1d3f7be2565cb903a06fcb44591db8'),
    ('public.hr_ledger_immutable()', '677a4bd4e9f3a3fb2d43a369e3408b01'),
    ('public.hr_beta_signup_log_immutable()', 'fbd1a2c1d9ef33f6a81962729ac23cb4')
  ) p(sig, pre) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 <> r.pre and position('ACCOUNT-DELETE' in (select prosrc from pg_proc where oid = to_regprocedure(r.sig))) = 0 then
      raise exception 'PIN: % is neither its live image (%) nor this file''s - md5 %: another file moved it; re-derive', r.sig, left(r.pre, 8), v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE TWO TABLES ───────────────────────────────────────────────────────
create table if not exists public.hr_account_deletions (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  stand_in     uuid        not null default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  purge_at     timestamptz not null,
  check (purge_at > requested_at)
);
create index if not exists hr_account_deletions_due on public.hr_account_deletions (purge_at);
alter table public.hr_account_deletions enable row level security;
comment on table public.hr_account_deletions is
  '2027-02-25-account-delete.sql: accounts set to be deleted. A row is the whole state: hr_admitted refuses it, Keep removes it, the job purges it at purge_at. '
  'Written only by hr_account_delete_request and hr_account_keep; RLS: own row, read only.';

-- What happened, with no account in it: the stand-in is random and appears nowhere with an id. It outlives the purge on purpose.
create table if not exists public.hr_account_deletion_log (
  id       bigint      generated always as identity primary key,
  stand_in uuid        not null,
  event    text        not null check (event in ('requested', 'kept', 'purged')),
  at       timestamptz not null default now(),
  detail   jsonb       not null default '{}'::jsonb
);
alter table public.hr_account_deletion_log enable row level security;
comment on table public.hr_account_deletion_log is
  '2027-02-25-account-delete.sql: requested / kept / purged, keyed on the random stand-in, never an account. detail holds row counts by table. Server-only.';

do $mig$
declare r text;
begin
  revoke all on public.hr_account_deletions from public;
  revoke all on public.hr_account_deletion_log from public;
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.hr_account_deletions from %I', r);
      execute format('revoke all on public.hr_account_deletion_log from %I', r);
    end if;
  end loop;
end $mig$;
grant select on public.hr_account_deletions to authenticated;
drop policy if exists hr_account_deletions_own on public.hr_account_deletions;
create policy hr_account_deletions_own on public.hr_account_deletions
  for select to authenticated using (user_id = (select auth.uid()));

-- ── §2 THE RULES IN ONE PLACE ───────────────────────────────────────────────
-- src/data/account-rules.js ACCOUNT_GRACE_DAYS says this number out loud; tests/account-delete.mjs fails if they differ.
create or replace function public.hr_account_grace()
returns interval language sql immutable set search_path = public, pg_catalog as $$ select interval '30 days' $$;

-- The signed token's own word that this session signed in with its password just now (see the header). Fails closed.
create or replace function public.hr_account_signin_fresh()
returns boolean language plpgsql set search_path = public, pg_catalog as $$
declare v jsonb; v_at numeric;
begin
  begin
    v := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then return false; end;
  if v is null or jsonb_typeof(v->'amr') is distinct from 'array' then return false; end if;
  select max((e->>'timestamp')::numeric) into v_at from jsonb_array_elements(v->'amr') e
   where jsonb_typeof(e) = 'object' and e->>'method' = 'password' and jsonb_typeof(e->'timestamp') = 'number';
  return v_at is not null and to_timestamp(v_at) >= now() - interval '5 minutes' and to_timestamp(v_at) <= now() + interval '1 minute';
end $$;

-- ── §3 THE GATES: hr_admitted (L2, L3, L4 follow it) AND THE HOOK (L1) ──────
-- closed-mode §3's body plus one line. INVOKER as before: a client sees only its own row in both tables.
create or replace function public.hr_admitted(p_user uuid)
 returns boolean
 language sql
 volatile
 security invoker
 set search_path to 'public', 'pg_catalog'
as $fn$
  -- ACCOUNT-DELETE (2027-02-25-account-delete.sql): an account set to be deleted isn't admitted, open game or closed.
  select p_user is not null
     and not exists (select 1 from public.hr_account_deletions d where d.user_id = p_user)
     and (coalesce((select not f.enabled from public.hr_flags f where f.key = 'closed_mode'), false)
          or exists (select 1 from public.hr_access_allowlist a where a.user_id = p_user));
$fn$;

create or replace function public.hr_access_check()
 returns void
 language plpgsql
 volatile
 security invoker
 set search_path to 'public', 'pg_catalog'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_path text;
  v_purge timestamptz;
begin
  -- Two statements, not `is null OR hr_admitted(…)`: SQL does not promise to
  -- short-circuit, and anon / service_role hold no EXECUTE on hr_admitted.
  if v_uid is null then return; end if;
  -- ACCOUNT-DELETE (2027-02-25-account-delete.sql): a leaving account reaches keeping itself and nothing else; any account may
  -- ask to leave, a closed-mode one too. PostgREST routes on this path, so naming it runs exactly that function. An unread path
  -- reads as neither: refused. Every other caller's request stops at the first return below, and reads no path.
  select d.purge_at into v_purge from public.hr_account_deletions d where d.user_id = v_uid;
  if v_purge is null and public.hr_admitted(v_uid) then return; end if;
  v_path := regexp_replace(coalesce(current_setting('request.path', true), ''), '^/rest/v1', '');
  if v_purge is not null then
    if v_path in ('/rpc/hr_account_keep', '/rpc/hr_account_delete_request') then return; end if;
    raise sqlstate 'PGRST' using
      message = jsonb_build_object('code', 'hr_account_leaving', 'message', 'This account is set to be deleted.',
                                   'details', to_char(v_purge at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'hint', null)::text,
      detail  = '{"status":403,"headers":{}}';
  end if;
  if v_path = '/rpc/hr_account_delete_request' then return; end if;
  raise sqlstate 'PGRST' using
    message = '{"code":"hr_closed","message":"Hearthrise is closed while we rebuild it.","details":null,"hint":null}',
    detail  = '{"status":403,"headers":{}}';
end $fn$;

-- ── §4 THE ONE ADMITTED UPDATE ON TWO APPEND-ONLY TABLES ────────────────────
-- hr.account_purge is `<owner>:<stand-in>`, transaction-local, set only by hr_account_purge. Everything else still raises.
create or replace function public.hr_ledger_immutable()
returns trigger language plpgsql set search_path = public as $$
declare v_keep int;
begin
  if tg_op = 'DELETE' then
    select retain_days into v_keep from public.hr_ledger_config;
    if old.at >= now() - make_interval(days => coalesce(v_keep, 90)) then
      raise exception 'player_ledger row is inside the % day retention window and cannot be deleted',
        coalesce(v_keep, 90) using errcode = 'check_violation';
    end if;
    return old;
  end if;
  -- ACCOUNT-DELETE (2027-02-25-account-delete.sql): a purged owner's row keeps its amounts under the stand-in. Only the owner,
  -- meta and the intent's tail move; a row older than the purse columns gets the values their CHECK now asks of any write.
  if tg_op = 'UPDATE' and current_setting('hr.account_purge', true) = old.user_id::text || ':' || new.user_id::text
     and new.meta = '{}'::jsonb and new.intent is not distinct from split_part(old.intent, ':', 1)
     and (to_jsonb(new) - array['user_id', 'meta', 'intent', 'purse', 'gold_kind']) = (to_jsonb(old) - array['user_id', 'meta', 'intent', 'purse', 'gold_kind'])
     and (old.purse is null or new.purse = old.purse) and (old.gold_kind is null or new.gold_kind = old.gold_kind) then
    return new;
  end if;
  raise exception 'player_ledger is append-only (attempted %)', tg_op
    using errcode = 'check_violation';
end $$;

create or replace function public.hr_beta_signup_log_immutable()
returns trigger language plpgsql set search_path to 'public', 'pg_catalog' as $function$
begin
  if tg_op = 'UPDATE' then
    -- ACCOUNT-DELETE (2027-02-25-account-delete.sql): a purged owner's row stays in the abuse trail with nothing that names them.
    if split_part(coalesce(current_setting('hr.account_purge', true), ''), ':', 1) = old.user_id::text
       and new.user_id is null and new.ip is null and new.email_domain is null and new.detail is null
       and new.id = old.id and new.at = old.at and new.outcome = old.outcome and new.code is not distinct from old.code then
      return new;
    end if;
    raise exception 'beta_signup_log is append-only (UPDATE refused)';
  elsif tg_op = 'TRUNCATE' then
    raise exception 'beta_signup_log is append-only (TRUNCATE refused)';
  elsif tg_op = 'DELETE' then
    if old.at > now() - interval '180 days' then
      raise exception 'beta_signup_log is append-only (DELETE refused for rows newer than 180 days)';
    end if;
    return old;
  end if;
  return null;
end $function$;

-- ── §5 THE BOARDS LEAVE A LEAVING ACCOUNT OUT ───────────────────────────────
alter table public.hr_lb_hidden drop constraint if exists hr_lb_hidden_reason_check;
alter table public.hr_lb_hidden add constraint hr_lb_hidden_reason_check check (reason in ('test', 'banned', 'name', 'leaving'));

-- ── §6 THE ACCOUNT GOES QUIET: IDEMPOTENT, DESTROYS NOTHING, CALLED AT THE REQUEST AND BY EVERY SWEEP ─
-- The caller holds hr:account:<uid>. Parties first: a kick locks the party, then the hero.
create or replace function public.hr_account_quiet(p_user uuid)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_m record; v_o record; v_s record; v_i uuid; v_l public.market_listings%rowtype; v_h int;
  v_ids uuid[] := '{}'; v_insts uuid[] := '{}';
  v_parties int := 0; v_hunts int := 0; v_listings int := 0; v_jobs int := 0;
begin
  -- (1) PARTIES: each hero's seat, the next seat leads (hr_party_drop), the seats left are told.
  for v_m in select m.party_id, m.slot from public.hunt_party_members m where m.user_id = p_user order by m.party_id, m.seat loop
    perform 1 from public.hunt_parties where id = v_m.party_id for update;
    perform public.hr_party_drop(v_m.party_id, p_user, v_m.slot);
    for v_o in select o.user_id, o.slot from public.hunt_party_members o
                where o.party_id = v_m.party_id and o.user_id <> p_user order by o.seat loop
      perform public.hr_party_notice(v_o.user_id, v_o.slot, 'left', p_user, v_m.slot);
    end loop;
    v_parties := v_parties + 1;
  end loop;
  delete from public.hunt_party_invites where from_user = p_user or to_user = p_user;
  delete from public.party_seekers where user_id = p_user;

  -- (2) HUNTS: the settle's lock order, instance then hero. Marked left first, so the end reads "You left the hunt." and not as a
  --     refused window: the forfeit flag means the server failed, and it didn't. Its partners hunt on (see the header).
  for v_s in select h.id, h.instance_id, h.slot from public.hunt_sessions h
              where h.user_id = p_user and h.ended_at is null order by h.instance_id, h.slot loop
    perform 1 from public.hunt_instances i where i.id = v_s.instance_id for update;
    perform public.hr_hunt_lock(p_user, v_s.slot);
    update public.hunt_sessions set leave_at = coalesce(leave_at, now()), version = version + 1 where id = v_s.id and ended_at is null;
    v_ids := v_ids || v_s.id;
    if not v_s.instance_id = any (v_insts) then v_insts := v_insts || v_s.instance_id; end if;
  end loop;
  foreach v_i in array v_insts loop
    if exists (select 1 from public.hunt_sessions o where o.instance_id = v_i and o.ended_at is null and o.user_id <> p_user) then
      for v_s in select h.id from public.hunt_sessions h where h.instance_id = v_i and h.user_id = p_user and h.ended_at is null order by h.slot loop
        perform public.hr_hunt_forfeit_seat(v_i, v_s.id, 'account_closing', '{}'::jsonb, 0);
      end loop;
      update public.hunt_instances set version = version + 1 where id = v_i;
    else
      perform public.hr_hunt_forfeit(v_i, 'account_closing', '{}'::jsonb);
    end if;
  end loop;
  update public.hunt_sessions set forfeit = false where id = any (v_ids) and forfeit;
  v_hunts := cardinality(v_ids);

  -- (3) THE MARKET: every listing back to Storage, as the expiry sweep returns one. The delete is the arbiter.
  if exists (select 1 from public.market_listings where user_id = p_user) then
    perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || p_user::text, 0));
    for v_l in delete from public.market_listings where user_id = p_user returning * loop
      insert into public.account_bank as b (user_id, item_id, qty, updated_at)
        values (v_l.user_id, v_l.item_id, v_l.qty, now())
        on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
      insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_l.user_id, v_l.slot, 'trade', 'market_expire:' || v_l.id::text, v_l.item_id, v_l.qty, 0, 0, 0, 0, 0,
              jsonb_build_object('listing', v_l.id, 'returned', 'storage', 'reason', 'account_closing', 'fee_kept', v_l.fee));
      v_listings := v_listings + 1;
    end loop;
  end if;

  -- (4) TOWN JOBS: each hero idles (the pointer's own writer). Whatever the job hadn't settled is unpaid; it was at most a tick.
  for v_h in select ps.slot from public.player_state ps where ps.user_id = p_user and ps.active_kind is distinct from 'idle' order by ps.slot loop
    perform public.hr_hunt_lock(p_user, v_h);
    perform public.hr_hunt_point(p_user, v_h, null);
    v_jobs := v_jobs + 1;
  end loop;

  -- (5) GONE FROM THE WORLD: presence, town bodies and the play cap's claims.
  delete from public.character_presence where user_id = p_user;
  delete from public.social_presence where user_id = p_user;
  delete from public.town_bodies where user_id = p_user;
  delete from public.town_positions where user_id = p_user;
  delete from public.town_seen where user_id = p_user;
  delete from public.town_moves where user_id = p_user;
  delete from public.session_claims where user_id = p_user;
  delete from public.account_play_net where user_id = p_user;
  delete from public.hero_play_net where user_id = p_user;

  -- (6) THE BOARDS, from their next refresh.
  insert into public.hr_lb_hidden (user_id, slot, reason, note)
    select p_user, null, 'leaving', 'Set to be deleted (2027-02-25-account-delete.sql).'
     where not exists (select 1 from public.hr_lb_hidden h where h.user_id = p_user and h.slot is null);

  return jsonb_build_object('parties', v_parties, 'hunts', v_hunts, 'listings', v_listings, 'jobs', v_jobs);
end $$;

-- ── §7 THE TWO VERBS ────────────────────────────────────────────────────────
create or replace function public.hr_account_delete_request(p_confirm text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'account_delete';
  v_uid uuid := auth.uid(); v_r jsonb; v_d public.hr_account_deletions%rowtype; v_q jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, 0, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if not public.hr_rate_ok(v_uid, 'account', 10, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:account:' || v_uid::text, 0));
  -- ONE REQUEST, HOWEVER MANY PRESSES: the first one's dates stand.
  select * into v_d from public.hr_account_deletions where user_id = v_uid;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'requested_at', v_d.requested_at, 'purge_at', v_d.purge_at);
  end if;
  -- AN OLD RETRY MAY NOT DELETE AN ACCOUNT ITS OWNER HAS SINCE KEPT.
  v_r := public.hr_intent_replay(v_uid, 0, p_idem, c_verb);
  if v_r is not null then
    if coalesce(v_r->>'ok', '') = 'true' then return public.hr_note_rejection(c_verb, 0, jsonb_build_object('ok', false, 'error', 'already_kept')); end if;
    return v_r;
  end if;
  if p_confirm is distinct from 'DELETE' then return public.hr_note_rejection(c_verb, 0, jsonb_build_object('ok', false, 'error', 'bad_confirm')); end if;
  if not public.hr_account_signin_fresh() then return public.hr_note_rejection(c_verb, 0, jsonb_build_object('ok', false, 'error', 'stale_signin')); end if;
  insert into public.hr_account_deletions (user_id, purge_at) values (v_uid, now() + public.hr_account_grace()) returning * into v_d;
  v_q := public.hr_account_quiet(v_uid);
  insert into public.hr_account_deletion_log (stand_in, event, detail) values (v_d.stand_in, 'requested', v_q);
  v_r := jsonb_build_object('ok', true, 'requested_at', v_d.requested_at, 'purge_at', v_d.purge_at);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, 0, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

create or replace function public.hr_account_keep(p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'account_keep';
  v_uid uuid := auth.uid(); v_r jsonb; v_d public.hr_account_deletions%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, 0, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if not public.hr_rate_ok(v_uid, 'account', 10, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:account:' || v_uid::text, 0));
  -- A RETRIED KEEP MAY NOT CANCEL A LATER REQUEST.
  v_r := public.hr_intent_replay(v_uid, 0, p_idem, c_verb);
  if v_r is not null then return v_r; end if;
  delete from public.hr_account_deletions where user_id = v_uid returning * into v_d;
  if not found then
    -- A token outlives the purge by up to an hour: say so, and leave no row for an account that isn't there.
    if not exists (select 1 from auth.users u where u.id = v_uid) then return jsonb_build_object('ok', false, 'error', 'account_gone'); end if;
    return jsonb_build_object('ok', true, 'kept', false);
  end if;
  delete from public.hr_lb_hidden where user_id = v_uid and reason = 'leaving';
  insert into public.hr_account_deletion_log (stand_in, event) values (v_d.stand_in, 'kept');
  v_r := jsonb_build_object('ok', true, 'kept', true);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, 0, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── §8 THE PURGE ────────────────────────────────────────────────────────────
-- EVERY COLUMN THAT CAN NAME A PERSON, READ FROM THE CATALOG, SO A FUTURE TABLE CAN'T BE FORGOTTEN. A uuid or uuid[] column in a
-- public base table IS one unless its name says it holds something else (the list below) and no foreign key says otherwise.
-- The default is to delete the row. A table that must outlive one player's leaving says so here, and tests/account-delete.mjs
-- fails a config or catalogue table whose person column has no rule (hr_tick_config's cursor: a delete would take the config).
create or replace function public.hr_account_person_columns()
returns table (tbl text, col text, is_array boolean, action text)
language sql stable set search_path = public, pg_catalog as $$
  with rules (tbl, col, action) as (values
    -- the journal of value, kept under the stand-in
    ('player_ledger', 'user_id', 'ledger'),
    ('player_ledger_rollup', 'user_id', 'stand_in'),
    ('market_sales', 'seller_user_id', 'stand_in'),
    ('market_sales', 'buyer_user_id', 'stand_in'),
    -- NOT NULL history of a clan that outlives them
    ('clan_order_votes', 'opened_by', 'stand_in'),
    ('clan_work_orders', 'posted_by', 'stand_in'),
    -- somebody else's row, or a shared one, that only points at them
    ('clan_ledger', 'user_id', 'clear'),
    ('clan_bans', 'by_user', 'clear'),
    ('clan_order_votes', 'closed_by', 'clear'),
    ('party_member', 'removed_by', 'clear'),
    ('hr_name_holds', 'user_id', 'clear'),
    ('hr_tick_config', 'cursor_user', 'clear'),
    ('hr_tick_shard_cursor', 'cursor_user', 'clear'),
    -- their own lines below
    ('beta_signup_log', 'user_id', 'signup_log'),
    ('clans', 'created_by', 'clan_owner'),
    ('hr_account_deletions', 'user_id', 'last')
  ), cols as (
    select c.relname::text as tbl, a.attname::text as col, a.atttypid = 'uuid[]'::regtype as is_array,
           exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any (k.conkey)
                     and k.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)) as fk
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where c.relkind in ('r', 'p') and a.atttypid in ('uuid'::regtype, 'uuid[]'::regtype)
  )
  select c.tbl, c.col, c.is_array, coalesce(r.action, 'delete')
    from cols c left join rules r on r.tbl = c.tbl and r.col = c.col
   where r.action is not null or c.fk
      or c.col <> all (array['id', 'session_id', 'instance_id', 'party_id', 'clan_id', 'hunt_id', 'listing_id', 'vote_id', 'order_id',
                             'message_id', 'claim_id', 'intent_id', 'prev_session_id', 'xp_session', 'balance_session', 'stand_in'])
   order by 1, 2
$$;

-- ONE STEP: 'not_due' | 'busy' | 'more' (a long ledger: the job comes back) | 'purged'. Raises on anything unexpected; the caller's
-- subtransaction rolls the whole step back. Owner-only (the §9 revoke): this is the one path to auth.users.
create or replace function public.hr_account_purge(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_batch constant int := 50000;
  v_d public.hr_account_deletions%rowtype; r record; v_n bigint; v_rows jsonb := '{}'::jsonb; v_insts uuid[]; v_note text;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('hr:account:' || p_user::text, 0)) then return jsonb_build_object('status', 'busy'); end if;
  select * into v_d from public.hr_account_deletions where user_id = p_user and purge_at <= now() for update;
  if not found then return jsonb_build_object('status', 'not_due'); end if;
  perform public.hr_account_quiet(p_user);
  perform set_config('hr.account_purge', p_user::text || ':' || v_d.stand_in::text, true);

  -- THE LEDGER, IN BATCHES. Nothing writes for a quiet account, so each pass shortens it. Its CHECK asks a gold row for a purse:
  -- a row older than that CHECK gets the neutral values, and the trigger admits only that (§4).
  with batch as (select l.at, l.id from public.player_ledger l where l.user_id = p_user limit c_batch)
  update public.player_ledger l
     set user_id = v_d.stand_in, meta = '{}'::jsonb, intent = split_part(l.intent, ':', 1),
         purse = case when coalesce(l.gold, 0) <> 0 and l.purse is null then 0 else l.purse end,
         gold_kind = case when coalesce(l.gold, 0) <> 0 and l.gold_kind is null then 'other' else l.gold_kind end
    from batch b where l.user_id = p_user and l.at = b.at and l.id = b.id;
  get diagnostics v_n = row_count;
  if v_n >= c_batch then
    perform set_config('hr.account_purge', '', true);
    return jsonb_build_object('status', 'more', 'ledger', v_n);
  end if;
  v_rows := v_rows || jsonb_build_object('player_ledger.user_id', v_n);

  -- THE SIGNUP LOG, its row emptied of everything that named them.
  update public.beta_signup_log set user_id = null, ip = null, email_domain = null, detail = null where user_id = p_user;
  get diagnostics v_n = row_count;
  if v_n > 0 then v_rows := v_rows || jsonb_build_object('beta_signup_log.user_id', v_n); end if;
  perform set_config('hr.account_purge', '', true);

  -- WHAT POINTS AT THEM FROM A ROW THAT STAYS, before anything goes.
  for r in select * from public.hr_account_person_columns() c where c.action in ('stand_in', 'clear') loop
    if r.action = 'stand_in' then
      execute format('update public.%I set %I = $1 where %I = $2', r.tbl, r.col, r.col) using v_d.stand_in, p_user;
    else
      execute format('update public.%I set %I = null where %I = $1', r.tbl, r.col, r.col) using p_user;
    end if;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_rows := v_rows || jsonb_build_object(r.tbl || '.' || r.col, v_n); end if;
  end loop;
  -- A CLAN STAYS WITH ITS NEXT MEMBER, OR GOES WITH ITS LAST (its foreign key would refuse the auth delete).
  update public.clans c set created_by = o.user_id
    from (select distinct on (m.clan_id) m.clan_id, m.user_id from public.clan_members m where m.user_id <> p_user order by m.clan_id, m.joined_at) o
   where c.created_by = p_user and c.id = o.clan_id;
  delete from public.clans where created_by = p_user;

  -- THEIR ANNOUNCEMENTS, which name their hero in another sender's line; the notices themselves go with the sweep below.
  delete from public.chat_messages m where m.id in (select w.message_id from public.hr_world_notices w where w.user_id = p_user and w.message_id is not null
                                                    union all select f.message_id from public.hearth_flames f where f.user_id = p_user and f.message_id is not null);
  select coalesce(array_agg(distinct s.instance_id), '{}') into v_insts from public.hunt_sessions s where s.user_id = p_user and s.instance_id is not null;

  -- THE ACCOUNT. Its foreign keys take sessions, identities, heroes and everything keyed on a hero.
  delete from auth.users where id = p_user;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'hr_account_purge: the auth user was not there to delete'; end if;

  -- EVERYTHING THAT NAMES THEM WITHOUT A FOREIGN KEY.
  for r in select * from public.hr_account_person_columns() c where c.action = 'delete' loop
    if r.is_array then
      execute format('delete from public.%I where $1 = any (%I)', r.tbl, r.col) using p_user;
    else
      execute format('delete from public.%I where %I = $1', r.tbl, r.col) using p_user;
    end if;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_rows := v_rows || jsonb_build_object(r.tbl || '.' || r.col, v_n); end if;
  end loop;

  -- THEIR HUNTS' WORLDS: gone with their last session; a world a partner still fights in loses this hero at its next settle.
  delete from public.hunt_instances i where i.id = any (v_insts)
     and not exists (select 1 from public.hunt_sessions s where s.instance_id = i.id);
  update public.hunt_instances i set world = null where i.id = any (v_insts) and i.world is not null
     and not exists (select 1 from public.hunt_sessions s where s.instance_id = i.id and s.ended_at is null);

  -- THE AUTH SERVER'S OWN JOURNAL NAMES THEM TOO (where it exists and may be written: it can't be proved before the apply).
  if to_regclass('auth.audit_log_entries') is not null then
    begin
      execute 'delete from auth.audit_log_entries where payload->>''actor_id'' = $1 or payload->''traits''->>''user_id'' = $1' using p_user::text;
    exception when insufficient_privilege or undefined_column or undefined_function then
      v_note := 'audit_log_kept: ' || sqlstate;
    end;
  end if;

  insert into public.hr_account_deletion_log (stand_in, event, detail)
    values (v_d.stand_in, 'purged', jsonb_build_object('rows', v_rows, 'note', v_note));
  return jsonb_build_object('status', 'purged', 'rows', v_rows);
end $$;

-- A STEP THAT FAILED IS RETRIED NEXT RUN AND SAID OUT LOUD ONCE A DAY. Names the stand-in, the stage and the constraint, never the account.
create or replace function public.hr_account_alert(p_stand_in uuid, p_stage text, p_state text, p_table text, p_constraint text)
returns void language plpgsql set search_path = public, pg_catalog as $$
begin
  insert into public.maintenance_alerts (source, ref, severity, message, detail)
  values ('cron', 'account-delete:' || p_stage || ':' || p_stand_in::text || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'), 'critical',
          'an account deletion could not finish its ' || p_stage,
          jsonb_build_object('stand_in', p_stand_in, 'sqlstate', p_state, 'table', p_table, 'constraint', p_constraint))
  on conflict (ref) do nothing;
end $$;

-- THE JOB. Every leaving account goes quiet again (the race in the header; a gate that ever regressed), then what is due goes.
create or replace function public.hr_account_purge_run(p_limit int default 5)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_lim constant int := greatest(1, least(50, coalesce(p_limit, 5)));
  r record; v jsonb; v_state text; v_tbl text; v_con text;
  v_quiet int := 0; v_purged int := 0; v_more int := 0; v_failed int := 0;
begin
  for r in select d.user_id, d.stand_in from public.hr_account_deletions d order by d.purge_at loop
    begin
      if pg_try_advisory_xact_lock(hashtextextended('hr:account:' || r.user_id::text, 0)) then
        perform public.hr_account_quiet(r.user_id);
        v_quiet := v_quiet + 1;
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_tbl = table_name, v_con = constraint_name;
      perform public.hr_account_alert(r.stand_in, 'sweep', v_state, v_tbl, v_con);
      v_failed := v_failed + 1;
    end;
  end loop;
  for r in select d.user_id, d.stand_in from public.hr_account_deletions d where d.purge_at <= now() order by d.purge_at limit c_lim loop
    begin
      v := public.hr_account_purge(r.user_id);
      if v->>'status' = 'purged' then v_purged := v_purged + 1;
      elsif v->>'status' = 'more' then v_more := v_more + 1; end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_tbl = table_name, v_con = constraint_name;
      perform public.hr_account_alert(r.stand_in, 'purge', v_state, v_tbl, v_con);
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('quiet', v_quiet, 'purged', v_purged, 'more', v_more, 'failed', v_failed);
end $$;

-- ── §9 GRANTS, THE JOB, THE BASELINE ────────────────────────────────────────
revoke execute on function public.hr_account_grace() from public, anon, authenticated, service_role;
revoke execute on function public.hr_account_signin_fresh() from public, anon, authenticated, service_role;
revoke execute on function public.hr_account_quiet(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_account_person_columns() from public, anon, authenticated, service_role;
revoke execute on function public.hr_account_purge(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_account_alert(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_account_purge_run(integer) from public, anon, authenticated, service_role;
revoke execute on function public.hr_account_delete_request(text, uuid) from public;
revoke execute on function public.hr_account_delete_request(text, uuid) from anon, service_role;
grant  execute on function public.hr_account_delete_request(text, uuid) to authenticated;
revoke execute on function public.hr_account_keep(uuid) from public;
revoke execute on function public.hr_account_keep(uuid) from anon, service_role;
grant  execute on function public.hr_account_keep(uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_account_delete_request', 'hr_account_keep');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_account_delete_request', 'p_confirm text, p_idem uuid', 'authenticated',
   'added 2027-02-25: ask to delete the caller''s own account (auth.uid()); needs a fresh password sign-in in the signed token; the account stops playing at once, purged in 30 days by the job'),
  ('hr_account_keep', 'p_idem uuid', 'authenticated',
   'added 2027-02-25: cancel the caller''s own waiting deletion; the one other call a leaving account''s pre-request hook lets through');

do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent: schedule by hand: select cron.schedule(''hr-account-purge'', ''*/10 * * * *'', ''select public.hr_account_purge_run()'')';
  else
    perform public.hr_cron_ensure('hr-account-purge', '*/10 * * * *', 'select public.hr_account_purge_run()');
  end if;
end $mig$;

-- ── §10 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back: request, keep, request, purge ──
do $$
declare
  c_a constant uuid := '000000c0-0000-4000-a000-0000ac0de101';
  c_b constant uuid := '000000c0-0000-4000-a000-0000ac0de102';
  c_fresh constant text := jsonb_build_object('sub', c_a, 'role', 'authenticated', 'amr',
    jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now()))::bigint)))::text;
  c_old constant text := jsonb_build_object('sub', c_a, 'role', 'authenticated', 'amr',
    jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now() - interval '1 hour'))::bigint)))::text;
  v jsonb; v_hunt text; v_item text; v_purge timestamptz; v_stand uuid; v_key uuid := gen_random_uuid(); v_s uuid; v_n bigint; v_ok boolean; r record;
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    select m.item_id into v_item from public.hr_market_items m where m.listable order by m.item_id limit 1;
    if v_hunt is null or v_item is null then raise exception 'VERIFY-harness: no ground or no listable item'; end if;
    insert into auth.users (id) values (c_a), (c_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_a, 'account-delete §10 probe'), (c_b, 'account-delete §10 probe') on conflict (user_id) do nothing;
    perform set_config('request.headers', '{"cf-connecting-ip":"198.51.100.61"}', true);
    perform set_config('request.jwt.claim.sub', c_b::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY-harness: hr_create_character (B) refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', c_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY-harness: hr_create_character (A) refused: %', v; end if;
    perform set_config('request.jwt.claims', c_fresh, true);

    -- (a) the two refusals: the wrong word, a sign-in that isn't fresh. Nothing is written.
    v := public.hr_account_delete_request('delete', gen_random_uuid());
    if v->>'error' is distinct from 'bad_confirm' then raise exception 'VERIFY(a): a wrong word answered %', v; end if;
    perform set_config('request.jwt.claims', c_old, true);
    v := public.hr_account_delete_request('DELETE', gen_random_uuid());
    if v->>'error' is distinct from 'stale_signin' then raise exception 'VERIFY(a): an hour-old sign-in answered %', v; end if;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_a, 'role', 'authenticated')::text, true);
    v := public.hr_account_delete_request('DELETE', gen_random_uuid());
    if v->>'error' is distinct from 'stale_signin' then raise exception 'VERIFY(a): a token without amr answered %', v; end if;
    if exists (select 1 from public.hr_account_deletions where user_id = c_a) then raise exception 'VERIFY(a): a refusal wrote a row'; end if;

    -- (b) the request: the door shuts at every layer; a second request moves nothing.
    perform set_config('request.jwt.claims', c_fresh, true);
    v := public.hr_account_delete_request('DELETE', v_key);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the request answered %', v; end if;
    v_purge := (v->>'purge_at')::timestamptz;
    if v_purge <> now() + public.hr_account_grace() then raise exception 'VERIFY(b): purge_at is not now + grace: %', v; end if;
    if public.hr_admitted(c_a) or public.hr_rate_gate(c_a, 0, 'accrue') then raise exception 'VERIFY(b): a leaving account is still admitted (L2/L3/L4)'; end if;
    v_ok := false;
    begin
      perform set_config('request.path', '/rpc/hr_load', true);
      perform public.hr_access_check();
    exception when sqlstate 'PGRST' then
      v_ok := position('hr_account_leaving' in sqlerrm) > 0;
    end;
    if not v_ok then raise exception 'VERIFY(b): the hook did not refuse a leaving account hr_account_leaving'; end if;
    perform set_config('request.path', '/rpc/hr_account_keep', true);
    perform public.hr_access_check();
    perform set_config('request.path', '', true);
    v := public.hr_account_delete_request('DELETE', gen_random_uuid());
    if (v->>'purge_at')::timestamptz is distinct from v_purge or (select count(*) from public.hr_account_deletion_log l
         where l.stand_in = (select d.stand_in from public.hr_account_deletions d where d.user_id = c_a)) <> 1 then
      raise exception 'VERIFY(b): a second request was not the first: %', v; end if;

    -- (c) keep: admitted again; an old retry of the request can't delete it now; a Keep retry can't cancel a later request.
    v := public.hr_account_keep(v_key);
    if v->>'error' is distinct from 'intent_mismatch' then raise exception 'VERIFY(c): a key reused across verbs answered %', v; end if;
    v_s := gen_random_uuid();
    v := public.hr_account_keep(v_s);
    if coalesce(v->>'kept', '') <> 'true' or not public.hr_admitted(c_a) or exists (select 1 from public.hr_lb_hidden h where h.user_id = c_a) then
      raise exception 'VERIFY(c): keep answered %', v; end if;
    v := public.hr_account_delete_request('DELETE', v_key);
    if v->>'error' is distinct from 'already_kept' or exists (select 1 from public.hr_account_deletions where user_id = c_a) then
      raise exception 'VERIFY(c): an old retry after a keep answered %', v; end if;

    -- (d) a hunt, a listing, a sale and a block cross the second request.
    update public.player_state set level_xp = 100000000 where user_id in (c_a, c_b) and slot = 0;
    execute 'set local role authenticated';
    v := public.hr_hunt_enter(0, v_hunt, '[]'::jsonb, 0, null, gen_random_uuid());
    execute 'reset role';
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY-harness: the probe hunt was refused: %', v; end if;
    insert into public.market_listings (user_id, slot, source, item_id, qty, qty_listed, ask_each, fee, expires_at)
      values (c_a, 0, 'storage', v_item, 3, 3, 10, 1, now() + interval '1 day');
    insert into public.market_sales (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot, item_id, qty, gold_gross, tax, gold_net)
      values (gen_random_uuid(), c_a, 0, c_b, 0, v_item, 1, 10, 0, 10);
    insert into public.chat_blocks (blocker_id, blocked_id) values (c_b, c_a);
    v := public.hr_account_delete_request('DELETE', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the second request answered %', v; end if;
    if exists (select 1 from public.hunt_sessions h where h.user_id = c_a and h.ended_at is null)
       or (select h.end_reason from public.hunt_sessions h where h.user_id = c_a order by h.entered_at desc limit 1) is distinct from 'left'
       or (select h.forfeit from public.hunt_sessions h where h.user_id = c_a order by h.entered_at desc limit 1) then
      raise exception 'VERIFY(d): the hunt did not end as left'; end if;
    if (select ps.active_kind from public.player_state ps where ps.user_id = c_a and ps.slot = 0) is distinct from 'idle' then raise exception 'VERIFY(d): the hero is not idle'; end if;
    if exists (select 1 from public.market_listings where user_id = c_a) or (select b.qty from public.account_bank b where b.user_id = c_a and b.item_id = v_item) is distinct from 3 then
      raise exception 'VERIFY(d): the listing did not come back to Storage'; end if;
    if not exists (select 1 from public.hr_lb_hidden where user_id = c_a and reason = 'leaving') then raise exception 'VERIFY(d): the boards still rank them'; end if;

    -- (e) not due is not touched; a request made 30 days ago is.
    v := public.hr_account_purge(c_a);
    if v->>'status' is distinct from 'not_due' or not exists (select 1 from auth.users where id = c_a) then raise exception 'VERIFY(e): an account not due answered %', v; end if;
    update public.hr_account_deletions set requested_at = now() - interval '31 days', purge_at = now() - interval '1 second' where user_id = c_a
      returning stand_in into v_stand;
    select count(*) into v_n from public.player_ledger where user_id = c_a;
    if v_n = 0 then raise exception 'VERIFY-harness: the probe wrote no ledger row'; end if;
    v := public.hr_account_purge(c_a);
    if v->>'status' is distinct from 'purged' then raise exception 'VERIFY(e): the purge answered %', v; end if;

    -- (f) nothing names them; what must stay, stays, under the stand-in; the bystander is whole.
    if exists (select 1 from auth.users where id = c_a) then raise exception 'VERIFY(f): the auth user is still there'; end if;
    for r in select * from public.hr_account_person_columns() c loop
      if r.is_array then execute format('select count(*) from public.%I where $1 = any (%I)', r.tbl, r.col) into v_n using c_a;
      else execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into v_n using c_a; end if;
      if v_n <> 0 then raise exception 'VERIFY(f): %.% still names them (% rows)', r.tbl, r.col, v_n; end if;
    end loop;
    if not exists (select 1 from public.player_ledger l where l.user_id = v_stand) or exists (select 1 from public.player_ledger l where l.user_id = v_stand and l.meta <> '{}'::jsonb) then
      raise exception 'VERIFY(f): the ledger did not move to the stand-in, emptied'; end if;
    if not exists (select 1 from public.market_sales s where s.seller_user_id = v_stand and s.buyer_user_id = c_b) then raise exception 'VERIFY(f): the buyer''s record did not survive'; end if;
    if not exists (select 1 from public.player_state where user_id = c_b) or not exists (select 1 from auth.users where id = c_b) then raise exception 'VERIFY(f): the bystander was touched'; end if;
    if not exists (select 1 from public.hr_account_deletion_log l where l.stand_in = v_stand and l.event = 'purged') then raise exception 'VERIFY(f): the purge left no log row'; end if;

    -- (g) the two append-only locks hold outside the purge: its setting is cleared, and even set, only the anonymizing shape passes.
    v_ok := false;
    begin
      update public.player_ledger set gold = 1 where user_id = v_stand;
    exception when check_violation then v_ok := true; end;
    if not v_ok then raise exception 'VERIFY(g): an update of a ledger row was not refused'; end if;
    raise exception using errcode = 'HR876', message = 'account-delete §10 complete - rolling back';
  exception when sqlstate 'HR876' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  perform set_config('request.path', '', true);
  if exists (select 1 from auth.users where id in (c_a, c_b)) or exists (select 1 from public.hr_account_deletions where user_id in (c_a, c_b)) then
    raise exception 'VERIFY(h): §10 LEAKED a probe row'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.hr_account_deletions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.hr_account_deletion_log'::regclass) then raise exception 'VERIFY(h): RLS is off'; end if;
  if has_table_privilege('authenticated', 'public.hr_account_deletions', 'insert,update,delete,truncate')
     or has_table_privilege('authenticated', 'public.hr_account_deletion_log', 'select,insert,update,delete,truncate')
     or has_table_privilege('anon', 'public.hr_account_deletions', 'select,insert,update,delete,truncate') then
    raise exception 'VERIFY(h): a client role can write or read past its own row'; end if;
  for r in select * from (values ('anon'), ('authenticated'), ('service_role')) x(role) loop
    if has_function_privilege(r.role, 'public.hr_account_purge(uuid)', 'execute')
       or has_function_privilege(r.role, 'public.hr_account_purge_run(integer)', 'execute')
       or has_function_privilege(r.role, 'public.hr_account_quiet(uuid)', 'execute')
       or has_function_privilege(r.role, 'public.hr_account_person_columns()', 'execute') then
      raise exception 'VERIFY(h): % can reach the purge', r.role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_account_delete_request(text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_account_keep(uuid)', 'execute') then raise exception 'VERIFY(h): anon reaches a verb'; end if;
  if to_regclass('cron.job') is not null and not exists (select 1 from cron.job where jobname = 'hr-account-purge' and command = 'select public.hr_account_purge_run()') then
    raise exception 'VERIFY(h): the job is not scheduled'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'account-delete: request, keep, request, purge on a probe; nothing names it after; all green';
end $$;
