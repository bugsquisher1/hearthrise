-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-22-alert-relay.sql — A PERSON HEARS WITHIN MINUTES WHEN THE GAME IS ACTUALLY BROKEN.
--   (lane/r-alarm-relay, reliability-engineer, 2026-11-03; 20 new accounts join Wednesday 11-04.)
--
-- STATUS: STAGED. Pre-EA (CLAUDE.md §2): applies on its passing §10, one file via the Coordinator's
-- apply tool, never inside begin/commit, never 00:00-00:10 UTC. EDGE: none. CLIENT: none.
-- ORDER: anywhere after 2027-02-20-party-leader-starts.sql; touches nothing lane/c-legacy-keys or
-- lane/c-carry-in restate. Tyler then supplies two Vault secrets (below); until he does it does
-- nothing, visibly, and costs one maintenance_log row an hour.
--
-- ── WHAT WAS TRUE (read-only on production, 2026-11-03 06:00 UTC) ────────────
--   Nothing reaches a person. maintenance_alerts held 205 rows, 200 unacked, 166 of them critical;
--   no reader but a manual vitals run, no post anywhere. The 166:
--     152  slot-health:no_pgoutput_slot   FALSE when idle. Realtime holds a TEMPORARY slot only while a socket is
--                                         connected: its log says "Tenant has no connected users" and the slot goes;
--                                         the first join recreates it in ~1 s. An hour with nobody online is not an outage.
--       5  table-size:player_ledger       STALE fuse. The §6 journal, 90 day retention, 14 days old: nothing is past
--                                         retention. "Retention is not keeping up" was untrue.
--       2  db-size + 1 db-growth          REAL THEN, fixed by 2027-02-11-db-retention.sql (frames, 377 MB). The fuse
--                                         itself is the 500 MB free tier's; the disk has been 8 GB since 10-28.
--       6  cron-run                       REAL ONE-OFFS, all over: 3 "job startup timeout" 10-23, 1 tick deadlock 10-29
--                                         (the next fire worked), 2 jobs in August with a missing column.
--   The other 34 open rows are warn/info of the same classes. §8 acks all 200 (rows kept, 180 days).
--
--   And the failures that DID matter filed nothing critical at all. Backtest over the retained tick log (3 days):
--     10-31 07:16-13:44  the edge refused every settle, every 10 s (fenced_cap), 0 settled: 389 min, no alert.
--     10-31 13:45-19:39  posted every 10 s, the edge answered 200, no tick answer read back: 344 min, no alert.
--   Both now page once each (§5 tick-refusing, tick-unanswered). tick-silent would have paged nothing in those 3 days: the one
--   gap past 30 s is the 159.7 s restart at 13:42 on 10-31, and the tick is back before the watch's second look.
--
-- ── THE FUSES (§4). `critical` NOW MEANS A PERSON SHOULD ACT NOW ─────────────
--   Measured against: disk 8 GB (869 MB used, 242 MB database), model at 20 accounts 105-250 MB/day
--   (2,100-5,015 ledger rows a hero a day x 80 heroes x 623 bytes). Every arm still fires; tests/cron-health.mjs
--   still proves each at a scaled fuse. The 2026-09-03 numbers bracketed a 500 MB free tier.
--     fuse                    was      now      why
--     database warn           400 MB   4 GB     half the disk: a week's notice at the model's worst
--     database critical       800 MB   6 GB     75 %: Supabase grows the disk at 90 % and only every 6 h; act before that
--     db growth/24 h warn     50 MB    300 MB   above the model's worst 250 MB/day. Below it is what 20 accounts do
--     db growth/24 h crit     150 MB   1.5 GB   6x the model's worst: a runaway writer, under 5 days of disk
--     table warn              50 MB    1 GB     the ledger is meant to be big; 90 days of it is the §6 journal
--     table critical          100 MB   4 GB     half the disk in ONE table; db-size catches the rest
--     table growth/24 h warn  25 MB    100 MB   KEEPS b319: 57 MB/day from 6 players is ~190 MB/day at 20, and it warns.
--     rows/24 h warn          250k     500k     the model's peak is 400k/day
--     rows/24 h crit          1M       1M       unchanged: 2x hr_ledger_prune's ceiling, still real
--     connections 70 %/85 %   same     same     unchanged, and §5 adds the same 85 % at minute cadence
--     a failed cron run       critical warn     one failed run of a 10 s job heals in 10 s. A job STILL failing is §5
--                                               cron-failing, critical, in minutes rather than at the next :07.
--   The table-size message says what it knows ("past its fuse"), not "retention is not keeping up".
--
-- ── §5 THE WATCH: WHAT "ACTUALLY BROKEN" IS, EVERY MINUTE ───────────────────
--   code              fires when                                                        sustained  hears in
--   tick-silent       no hr_tick_cron_log row for 60 s (it fires every 10 s)            60 s       ~3 min
--   tick-broken       3 min of fires, none empty/posted/locked (no_hmac, no_secret...)  60 s       ~5 min
--   tick-unanswered   3+ posts in 5 min and no tick answer read back                    60 s       ~7 min
--   tick-refusing     3+ posts in 5 min, refused > 0, settled = 0                       30 min     ~35 min
--   hunts-stalled     worst lag > 240 s, or more than max(1, 10 %) past hunt-lag's      2 min      ~6 min
--                     STALLED line (flush + 2 x cadence + 15 = 125 s)
--   hunts-freezing    2+ WATCHED hunts past the 32 s look-ahead, and 30 %+ of the        3 min      ~4 min
--                     watched (hunt-health's FREEZING; a lone viewer's hidden tab is not an outage)
--   cron-failing      a job failed 3+ times in 15 min and its latest run failed         none       ~3 min
--   connections       over 85 % of max_connections                                      2 min      ~3 min
--   realtime-no-slot  someone is online (character_presence under 75 s) and no          4 min      ~5 min
--                     pgoutput slot exists (replaces the 5-minute hourly false alarm)
--   Each episode files ONE critical row; when it clears the row is acked and one `info` watch-clear row says for how long.
--   WHAT THIS CANNOT SEE: PostgREST or Auth down while the database is up; the database itself down (the dead-man, below);
--   a lone viewer's freeze under 240 s.
--
-- ── §6 THE RELAY ─────────────────────────────────────────────────────────────
--   Every minute, NEW critical rows and clears go to Discord. Vault secret `hr_alert_discord_webhook`; missing or malformed:
--   it posts nothing, never raises, keeps the alerts for later, and writes one maintenance_log row an hour saying so (and
--   vitals says so). The first run that finds a webhook posts one "connected" line, so the channel is proved before it matters.
--   FLOOD: at most 3 alert or clear posts in a rolling hour, a class repeats once an hour, and one "...and N more" an hour
--   tells the rest. 4 posts an hour at worst, 96 a day. Discord 429/5xx/timeout or no answer: retried, 3 attempts in all.
--   allowed_mentions is empty: nothing in an alert's text can ping anyone.
--
-- ── THE WEBHOOK AND pg_net's QUEUE: IT DOES LAND THERE ───────────────────────
--   net.http_post writes method, url, headers and body as a row in net.http_request_queue until the worker takes it. So the
--   webhook URL (and the ping URL) IS a row, for as long as that takes. MEASURED on production: 25 samples over 15 s saw a row
--   once, a single row, and the response row for it already written: well under a second. If the worker stops it stays until
--   the worker returns. The table is UNLOGGED (relpersistence u: no WAL, not replicated). net._http_response has no url
--   column; its 6 h rows hold Discord's answer, and ?wait=true's answer carries webhook_id and channel_id, never the token.
--   WHO CAN READ THE QUEUE: PUBLIC holds every privilege and postgres cannot revoke it (T-5, tests/pg-net-queue-unreachable.mjs,
--   re-read 2026-11-03: ACL unchanged). It is unreachable, not private: `net` is not in PostgREST's schemas, nothing exposed
--   reads it, and this file's whole relay sits in hr_ops, the sink that guard and hr_assert_grant_hygiene (9) already hold.
--   A Management API token could read a row in that window. WHAT I DID: this file never logs, returns or stores the URL (the
--   post helper keeps sqlstate only, because an error text may quote it; hr_ops.alert_relay_posts has no url column; pg_cron
--   records "1 row"), it validates the shape first so nothing else is ever sent, and the blast radius of a leak is posts into
--   one private channel: rotate by replacing one Vault row. Keeping it out of the queue altogether takes an Edge Function
--   holding the secret; that is the only stronger option and it is not worth a deploy here.
--
-- ── THE DEAD-MAN ─────────────────────────────────────────────────────────────
--   If the database is down the relay is silent. Vault secret `hr_alert_deadman_url` holds a Healthchecks.io ping URL (free
--   Hobbyist plan, 20 checks; https://hc-ping.com/<uuid>). Each minute hr_ops.alert_run pings it, ONLY if the watch and the
--   relay both ran clean: database down, pg_cron dead, pg_net dead or this relay broken all go quiet, and THEIR service tells
--   Tyler (email, or its Discord integration). Without the secret: nothing, no error.
--
-- ── WHAT TYLER DOES (no agent ever sees either value) ────────────────────────
--   Discord: a private channel, Edit Channel > Integrations > Webhooks > New Webhook, copy the URL; notifications for that
--   channel on All Messages. Supabase dashboard > Project Settings > Vault > Add new secret, name hr_alert_discord_webhook,
--   value the URL. Within a minute the channel says it is connected.
--   Healthchecks.io: free account, Add Check, period 1 minute, grace 3 minutes, an email or Discord integration, copy the ping
--   URL; Vault secret hr_alert_deadman_url. No migration is needed for either.
--
-- ── CAPACITY ─────────────────────────────────────────────────────────────────
--   hr-alert-relay: one job, every minute, ~100 ms of database (ESTIMATED: hr_slot_health's measured 61 ms plus small indexed reads,
--   against 14 ms/s today), 1,440 cron history rows a day (kept 3 days). alert_relay_posts:
--   at most 96 rows a day, pruned at 30 days in the same function, so at most ~2,900. watch_state: at most one row a code.
--   pg_net: one ping a minute, at most 12 posts an hour counting retries. hr-slot-health no longer files no_pgoutput_slot.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
--   Stop it:  select public.hr_cron_drop('hr-alert-relay');   (alerts keep filing, nothing posts, nothing pages)
--   Silence the channel: delete hr_alert_discord_webhook from Vault.
--   The fuses: re-apply 2027-01-16-cron-health-fast.sql §2 + 2027-02-11-db-retention.sql §3.
--   The history: update public.maintenance_alerts set acked_at = null where acked_at = <the apply's timestamp>;
--   No player row is read for money or written, by any of it.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare r record; v_md5 text;
begin
  if to_regclass('public.maintenance_alerts') is null or to_regclass('public.maintenance_log') is null
     or to_regclass('public.hr_tick_cron_log') is null or to_regclass('public.hr_tick_config') is null
     or to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_instances') is null
     or to_regclass('public.hr_rate_counters') is null or to_regclass('public.character_presence') is null
     or to_regnamespace('hr_ops') is null
     or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null then
    raise exception 'PRECONDITION: an object this file reads is missing'; end if;
  -- Each restated body is the image live on 2026-11-03 (and the replay's), or this file's.
  for r in select * from (values
    ('public.hr_cron_health_ex(interval,numeric)', 'ca1fd3110847408b6dc572e8085a578b', '82b02042f24b05b7e65b728a04b9e8af'),
    ('public.hr_slot_health()', '9a079d4ba6a803a0fa35f0186ee34310', '30c26b08a29c3c9a30137b8c1330bfc0'),
    ('public.hr_slot_health_alert()', '52e1f5589b7c7e208796da3649f35ec8', '87a0dcacbe89d5105834a6a2ea179e32')
  ) p(sig, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is % (want % or this file''s %): another file moved it; re-pin',
        r.sig, coalesce(v_md5, 'absent'), left(r.pre, 8), left(r.post, 8); end if;
  end loop;
end $mig$;

-- ── §1 THE RELAY'S OWN TABLES, IN THE SINK ───────────────────────────────────
-- hr_ops: owner postgres, not in PostgREST's schemas, no client or engine role can use it. No GRANT here, on purpose.
create table if not exists hr_ops.alert_relay_state (
  id           boolean primary key default true check (id),
  cursor_id    bigint not null,             -- the newest maintenance_alerts.id this relay has judged
  unsent       int not null default 0,      -- judged, not posted (a repeat or past the cap), not yet told
  unsent_since timestamptz,
  hello_at     timestamptz,                 -- the one "connected" line
  triage_id    bigint not null,             -- the newest alert when this file first ran: §8's line, exact on any re-apply
  noted_at     timestamptz                  -- last "no webhook" row in maintenance_log
);
create table if not exists hr_ops.alert_relay_posts (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('alert', 'clear', 'more', 'hello')),
  class      text not null,                 -- the alert's ref with its date, hour or id taken out
  alert_id   bigint,
  content    text not null,                 -- what the channel reads; there is no url column, on purpose
  request_id bigint,                        -- pg_net's id; null until a send was accepted
  sent_at    timestamptz,
  status     int,                           -- the answer, once read
  attempts   int not null default 0,
  done_at    timestamptz                    -- answered, or given up on
);
create index if not exists alert_relay_posts_class_at on hr_ops.alert_relay_posts (class, at desc);
create index if not exists alert_relay_posts_open on hr_ops.alert_relay_posts (id) where done_at is null;
create table if not exists hr_ops.watch_state (
  code      text primary key,
  since     timestamptz not null,
  last_at   timestamptz not null,
  alert_ref text,                           -- set once this episode has filed its one critical row
  detail    jsonb not null default '{}'::jsonb
);
alter table hr_ops.alert_relay_state enable row level security;
alter table hr_ops.alert_relay_posts enable row level security;
alter table hr_ops.watch_state enable row level security;
-- The relay only ever tells of what is filed after this file: the 166 are history (§8).
insert into hr_ops.alert_relay_state (id, cursor_id, triage_id)
  select true, x.m, x.m from (select coalesce(max(id), 0) as m from public.maintenance_alerts) x
on conflict (id) do nothing;

-- ── §2 ONE EPISODE, ONE ROW ──────────────────────────────────────────────────
create or replace function hr_ops.alert_note(p_code text, p_firing boolean, p_after interval, p_message text, p_detail jsonb)
returns boolean language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare
  v_row hr_ops.watch_state%rowtype;
  v_ref text;
begin
  if p_firing then
    insert into hr_ops.watch_state (code, since, last_at, detail)
      values (p_code, now(), now(), coalesce(p_detail, '{}'::jsonb))
      on conflict (code) do update set last_at = now(), detail = excluded.detail
      returning * into v_row;
    if v_row.alert_ref is null and now() - v_row.since >= p_after then
      v_ref := 'watch:' || p_code || ':' || floor(extract(epoch from v_row.since))::bigint;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
        values ('watch', v_ref, 'critical', p_message, coalesce(p_detail, '{}'::jsonb))
        on conflict (ref) do nothing;
      update hr_ops.watch_state set alert_ref = v_ref where code = p_code;
      return true;
    end if;
    return false;
  end if;
  delete from hr_ops.watch_state where code = p_code returning * into v_row;
  if found and v_row.alert_ref is not null then
    update public.maintenance_alerts set acked_at = now() where ref = v_row.alert_ref and acked_at is null;
    insert into public.maintenance_alerts (source, ref, severity, message, detail, acked_at)
      values ('watch', 'watch-clear:' || p_code || ':' || floor(extract(epoch from v_row.since))::bigint, 'info',
              format('%s: cleared after %s min', p_code, ceil(extract(epoch from now() - v_row.since) / 60)::bigint),
              jsonb_build_object('since', v_row.since), now())
      on conflict (ref) do nothing;
  end if;
  return false;
end $fn$;

-- ── §3 THE SLOT ALARM TELLS IDLE FROM DEAD ───────────────────────────────────
-- ABSENCE IS A SILENT STOP ONLY IF SOMEONE IS THERE TO HEAR. Zero pgoutput slots with nobody online is Realtime resting.
-- p_present null (it could not be read) reads as present: the alarm fails towards firing.
create or replace function public.hr_slot_health_judge(p_slots jsonb, p_pubs jsonb, p_realtime boolean, p_present boolean)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare
  -- 384 MB: Reliability's W2 line. It is 75 % of max_slot_wal_keep_size =
  -- 512 MB, so this fires with a quarter of the budget left and before
  -- Postgres invalidates the slot.
  c_min_safe constant numeric := 384 * 1048576;
  c_frames   constant text    := 'supabase_realtime_messages_publication';
  v_alarms   jsonb   := '[]'::jsonb;
  v_s        jsonb;
  v_slots    int     := 0;
  v_pgout    int     := 0;
  v_min_safe numeric;
  v_frame_pubs text[];
  v_idle     boolean := false;
begin
  for v_s in select e from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) e loop
    v_slots := v_slots + 1;
    if v_s->>'plugin' = 'pgoutput' then v_pgout := v_pgout + 1; end if;
    if coalesce(v_s->>'wal_status', '') <> 'reserved' then
      v_alarms := v_alarms || jsonb_build_object('code', 'slot_not_reserved', 'severity', 'critical',
        'slot', v_s->>'slot', 'wal_status', v_s->>'wal_status');
    end if;
    if jsonb_typeof(v_s->'safe_wal_size') is distinct from 'number' then
      v_alarms := v_alarms || jsonb_build_object('code', 'safe_wal_unknown', 'severity', 'warn',
        'slot', v_s->>'slot');
    elsif (v_s->>'safe_wal_size')::numeric < c_min_safe then
      v_alarms := v_alarms || jsonb_build_object('code', 'safe_wal_low', 'severity', 'critical',
        'slot', v_s->>'slot', 'safe_mb', round((v_s->>'safe_wal_size')::numeric / 1048576));
    end if;
    if jsonb_typeof(v_s->'safe_wal_size') = 'number' then
      v_min_safe := least(coalesce(v_min_safe, (v_s->>'safe_wal_size')::numeric),
                          (v_s->>'safe_wal_size')::numeric);
    end if;
  end loop;
  if v_pgout = 0 then
    if coalesce(p_present, true) then
      v_alarms := v_alarms || jsonb_build_object('code', 'no_pgoutput_slot', 'severity', 'critical',
        'slots', v_slots);
    else
      v_idle := true;
    end if;
  end if;

  -- W3: FRAME ROWS ARE IN EXACTLY ONE PUBLICATION. A FOR ALL TABLES publication
  -- contains realtime.messages too, so it counts.
  if coalesce(p_realtime, false) then
    select coalesce(array_agg(distinct x.pub order by x.pub), '{}'::text[]) into v_frame_pubs
      from (select e->>'pubname' as pub
              from jsonb_array_elements(coalesce(p_pubs, '[]'::jsonb)) e
             where coalesce((e->>'all_tables')::boolean, false)
                or (e->>'schema' = 'realtime' and e->>'rel' = 'messages')) x;
    if not (c_frames = any (v_frame_pubs)) then
      v_alarms := v_alarms || jsonb_build_object('code', 'frames_unpublished', 'severity', 'critical',
        'expected', c_frames);
    end if;
    if exists (select 1 from unnest(v_frame_pubs) p where p <> c_frames) then
      v_alarms := v_alarms || jsonb_build_object('code', 'frames_double_published', 'severity', 'critical',
        'publications', to_jsonb(v_frame_pubs));
    end if;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_alarms) = 0,
    'alarms', v_alarms,
    'slots', v_slots,
    'pgoutput_slots', v_pgout,
    'min_safe_mb', round(v_min_safe / 1048576),
    'realtime', coalesce(p_realtime, false),
    'idle', v_idle);
end $fn$;

-- SELECT-ONLY. Reads two catalogs every role can read, and who is online.
create or replace function public.hr_slot_health()
returns jsonb language sql stable set search_path = pg_catalog, public as $fn$
  select public.hr_slot_health_judge(
    coalesce((select jsonb_agg(jsonb_build_object(
                'slot', s.slot_name, 'plugin', s.plugin, 'active', s.active,
                'wal_status', s.wal_status, 'safe_wal_size', s.safe_wal_size,
                'retained_bytes', pg_wal_lsn_diff(pg_current_wal_lsn(), s.restart_lsn))
              order by s.slot_name)
                from pg_replication_slots s), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'pubname', p.pubname, 'all_tables', p.puballtables,
                'schema', n.nspname, 'rel', c.relname)
              order by p.pubname, n.nspname, c.relname)
                from pg_publication p
                left join pg_publication_rel r on r.prpubid = p.oid
                left join pg_class c on c.oid = r.prrelid
                left join pg_namespace n on n.oid = c.relnamespace), '[]'::jsonb),
    to_regclass('realtime.messages') is not null,
    exists (select 1 from public.character_presence cp where cp.seen_at > now() - interval '75 seconds'))
  || jsonb_build_object('at', now())
$fn$;
drop function if exists public.hr_slot_health_judge(jsonb, jsonb, boolean);

-- The slot's other alarms still file here, one row per code per UTC hour. no_pgoutput_slot needs two looks
-- (a socket can be a second from its slot), so it is the watch's, §5.
create or replace function public.hr_slot_health_alert()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare
  v_h     jsonb := public.hr_slot_health();
  v_a     jsonb;
  v_n     int := 0;
  v_one   int;
begin
  if coalesce((v_h->>'ok')::boolean, false) then
    return v_h || jsonb_build_object('filed', 0);
  end if;
  for v_a in select e from jsonb_array_elements(coalesce(v_h->'alarms', '[]'::jsonb)) e
              where e->>'code' <> 'no_pgoutput_slot' loop
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
    values ('telemetry',
            'slot-health:' || (v_a->>'code') || ':'
              || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24'),
            case when v_a->>'severity' in ('info', 'warn', 'critical') then v_a->>'severity' else 'critical' end,
            'realtime replication slot health: ' || (v_a->>'code'),
            v_h)
    on conflict (ref) do nothing;
    get diagnostics v_one = row_count;
    v_n := v_n + v_one;
  end loop;
  return v_h || jsonb_build_object('filed', v_n);
end $fn$;

-- ── §4 THE DETECTOR, RESTATED WITH ITS FUSES (table in the header) ───────────
create or replace function public.hr_cron_health_ex(p_window interval default '25:00:00'::interval, p_scale numeric default 1.0)
returns integer
language plpgsql security definer set search_path to 'public', 'pg_catalog' as $function$
declare
  -- ── THE SENSITIVITY SEAM. Clamped to (0, 1] so it can only ever make an
  --    alarm fire SOONER. `least(1.0, …)` is the half that matters: without it
  --    this parameter would be an off switch.
  c_scale constant numeric := least(1.0, greatest(0.000000001, coalesce(p_scale, 1.0)));

  -- ── THE FUSES. See the file header for what each one was measured against.
  c_db_warn        constant bigint := (4096::bigint * 1024 * 1024 * c_scale)::bigint;   -- half the 8 GB disk
  c_db_crit        constant bigint := (6144::bigint * 1024 * 1024 * c_scale)::bigint;   -- 75 %: the disk grows at 90 %, every 6 h at most
  c_db_growth_warn constant bigint := ( 300::bigint * 1024 * 1024 * c_scale)::bigint;  -- per 24h; the model at 20 accounts peaks at 250 MB
  c_db_growth_crit constant bigint := (1536::bigint * 1024 * 1024 * c_scale)::bigint;  -- a runaway writer, under 5 days of disk
  c_tbl_warn       constant bigint := (1024::bigint * 1024 * 1024 * c_scale)::bigint;
  c_tbl_crit       constant bigint := (4096::bigint * 1024 * 1024 * c_scale)::bigint;   -- half the disk in one table
  c_tbl_growth     constant bigint := ( 100::bigint * 1024 * 1024 * c_scale)::bigint;  -- per 24h; b319's 57 MB/day from 6 players is ~190 at 20
  c_rows_warn      constant bigint := (    500000 * c_scale)::bigint;          -- per 24h; the model at 20 accounts peaks at 400k
  c_rows_crit      constant bigint := (   1000000 * c_scale)::bigint;
  c_conn_warn      constant numeric := 0.70 * c_scale;
  c_conn_crit      constant numeric := 0.85 * c_scale;
  c_never_ran_grace constant interval := interval '48 hours';
  -- SERVER-PERF (2027-01-01-server-perf.sql): pg_cron's run history is kept this long (every check above
  -- reads at most 48 h of it) and pruned at most this many rows a run, by runid range (its only index).
  c_cron_keep      constant interval := interval '3 days';
  c_cron_prune_max constant bigint := 100000;

  v_alerts int := 0;
  r record;
  v_sev text; v_msg text;
  v_now  public.hr_db_samples%rowtype;
  v_prev public.hr_db_samples%rowtype;
  v_day  text := to_char(now(), 'YYYY-MM-DD');
  v_bytes bigint; v_rows bigint; v_delta bigint;
  v_first timestamptz;
  -- SERVER-PERF: every phase's wall time (ms) and the retention's count land in this run's maintenance_log row.
  v_t0 timestamptz := clock_timestamp();
  v_t  timestamptz := clock_timestamp();
  v_ph jsonb := '{}'::jsonb;
  v_lo bigint; v_hi bigint;
  v_pruned bigint := 0;
  v_prune_err text;
  -- CRON-HEALTH-FAST (2027-01-16-cron-health-fast.sql): (a) and (b) read the run history from this runid up.
  v_run_lo bigint;
begin
  -- ── (a) FAILED RUNS ─────────────────────────────────────────────────────
  -- CRON-HEALTH-FAST (2027-01-16-cron-health-fast.sql): (a) and (b) are read by hr_cron_failed_runs and
  -- hr_cron_stale_jobs from v_run_lo (hr_cron_run_floor) up, through pg_cron's only index (runid),
  -- instead of a seq scan of the whole history: after the 7-day prune the heap is still 68 MB (8,729
  -- pages for 110k runs), read cold once an hour (a_failed 2.7-3.5 s of a 2.9-3.7 s run, 2026-10-24).
  -- The readers take the two tables as arguments only so §4 can prove them on its own probe tables
  -- without writing pg_cron's (supabase_admin's); here they are always pg_cron's.
  if to_regclass('cron.job_run_details') is not null then
    v_run_lo := public.hr_cron_run_floor(to_regclass('cron.job_run_details'), p_window);
    for r in
      select * from public.hr_cron_failed_runs(to_regclass('cron.job_run_details'), to_regclass('cron.job'), v_run_lo, p_window)
    loop
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-run:' || r.runid, 'warn',   -- one run; a job STILL failing is hr_ops.alert_watch's cron-failing, in minutes
              format('cron job %s FAILED: %s', coalesce(r.jobname, 'jobid ' || r.jobid), left(coalesce(r.return_message,''), 300)),
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname, 'runid', r.runid,
                                 'status', r.status, 'start_time', r.start_time))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        raise warning '[cron-health] % FAILED: %', coalesce(r.jobname, r.jobid::text), left(coalesce(r.return_message,''), 300);
      end if;
    end loop;
    v_ph := v_ph || jsonb_build_object('a_failed', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
    v_t := clock_timestamp();

    -- ── (b) STOPPED vs NEVER STARTED, with (g) THE NEVER-RAN ESCALATION ──
    -- `any_run` is still the discriminator between the two. What is new is that
    -- "never ran" stops being a permanent excuse: once this database has SEEN
    -- the job for longer than the grace window (hr_db_samples.jobs is the only
    -- record of when — cron.job has no created_at), a job with no run history
    -- is not new, it is broken, and it escalates to 'warn' like any other.
    -- CRON-HEALTH-FAST: the same rows as the old group-by (an active job with no success in 48 h, its
    -- whole-history last_success and run count), found from v_run_lo up (hr_cron_stale_jobs).
    for r in
      select * from public.hr_cron_stale_jobs(to_regclass('cron.job_run_details'), to_regclass('cron.job'), v_run_lo)
    loop
      if r.any_run = 0 then
        select min(s.at) into v_first from public.hr_db_samples s where s.jobs ? r.jobname;
        if v_first is not null and v_first < now() - c_never_ran_grace then
          v_sev := 'warn';
          v_msg := format('cron job %s has NEVER run, and has been scheduled since %s — '
                          'it is not new, it is not firing', r.jobname, v_first);
        else
          v_sev := 'info';
          v_msg := format('cron job %s has no run history yet (new, or it has never fired)', r.jobname);
        end if;
      else
        v_sev := 'warn';
        v_msg := format('cron job %s has not succeeded since %s', r.jobname,
                        coalesce(r.last_success::text, 'never'));
      end if;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-stale:' || r.jobname || ':' || v_day, v_sev, v_msg,
              jsonb_build_object('jobid', r.jobid, 'jobname', r.jobname,
                                 'last_success', r.last_success, 'runs_seen', r.any_run,
                                 'first_seen', v_first))
      on conflict (ref) do nothing;
      if found then
        v_alerts := v_alerts + 1;
        if v_sev = 'warn' then raise warning '[cron-health] %', v_msg; else raise notice '[cron-health] %', v_msg; end if;
      end if;
    end loop;
    v_ph := v_ph || jsonb_build_object('b_stale', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
    v_t := clock_timestamp();
  else
    raise notice 'hr_cron_health: cron.job_run_details not readable — failure detection is INERT here';
  end if;

  -- ── THE SAMPLE. Taken BEFORE the size checks so this run's own numbers are
  --    the ones compared, and so a growth rate exists from the second run on.
  v_now := public.hr_db_sample(10);
  -- The nearest sample at least 24h old. `order by at desc limit 1` over an
  -- indexed primary key; NULL on a database younger than a day, which simply
  -- means no rate is reported yet (never a rate of "everything is new").
  select * into v_prev from public.hr_db_samples
   where at <= now() - interval '24 hours' order by at desc limit 1;
  v_ph := v_ph || jsonb_build_object('sample', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
  v_t := clock_timestamp();

  -- ── (d) DATABASE SIZE AND GROWTH ───────────────────────────────────────
  if v_now.db_bytes > c_db_warn then
    v_sev := case when v_now.db_bytes > c_db_crit then 'critical' else 'warn' end;
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
    values ('telemetry', 'db-size:' || v_day, v_sev,
            format('database is %s (fuse %s) — see the fuse table in 2027-02-22-alert-relay.sql',
                   pg_size_pretty(v_now.db_bytes), pg_size_pretty(c_db_warn)),
            jsonb_build_object('bytes', v_now.db_bytes, 'warn', c_db_warn, 'crit', c_db_crit))
    on conflict (ref) do nothing;
    if found then v_alerts := v_alerts + 1;
      raise warning '[cron-health] database is %', pg_size_pretty(v_now.db_bytes); end if;
  end if;

  if v_prev.at is not null then
    v_delta := v_now.db_bytes - v_prev.db_bytes;
    if v_delta > c_db_growth_warn then
      v_sev := case when v_delta > c_db_growth_crit then 'critical' else 'warn' end;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('telemetry', 'db-growth:' || v_day, v_sev,
              format('database grew %s in 24h (now %s) — b319 ran at ~57 MB/day from six players',
                     pg_size_pretty(v_delta), pg_size_pretty(v_now.db_bytes)),
              jsonb_build_object('delta', v_delta, 'bytes', v_now.db_bytes,
                                 'since', v_prev.at, 'warn', c_db_growth_warn))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] database grew % in 24h', pg_size_pretty(v_delta); end if;
    end if;
  end if;

  -- ── (e) PER TABLE: SIZE, GROWTH, ROW DELTA ─────────────────────────────
  -- (c) — the old hardcoded game_events check — is exactly this loop's
  -- `c_tbl_crit` arm, at exactly the same 100 MB, for every table rather than
  -- for the one that already burned us.
  for r in select key as relname, value as v from jsonb_each(v_now.tables)
  loop
    v_bytes := coalesce((r.v ->> 'b')::bigint, 0);
    v_rows  := coalesce((r.v ->> 'r')::bigint, 0);

    if v_bytes > c_tbl_warn then
      v_sev := case when v_bytes > c_tbl_crit then 'critical' else 'warn' end;
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('telemetry', 'table-size:' || r.relname || ':' || v_day, v_sev,
              format('public.%s is %s (%s rows) — past its fuse: is its retention running? (see b319)',
                     r.relname, pg_size_pretty(v_bytes), v_rows),
              jsonb_build_object('table', r.relname, 'bytes', v_bytes, 'rows', v_rows,
                                 'warn', c_tbl_warn, 'crit', c_tbl_crit))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] public.% is %', r.relname, pg_size_pretty(v_bytes); end if;
    end if;

    if v_prev.at is not null and v_prev.tables ? r.relname then
      v_delta := v_bytes - coalesce((v_prev.tables -> r.relname ->> 'b')::bigint, 0);
      if v_delta > c_tbl_growth then
        insert into public.maintenance_alerts (source, ref, severity, message, detail)
        values ('telemetry', 'table-growth:' || r.relname || ':' || v_day, 'warn',
                format('public.%s grew %s in 24h (now %s)', r.relname,
                       pg_size_pretty(v_delta), pg_size_pretty(v_bytes)),
                jsonb_build_object('table', r.relname, 'delta', v_delta, 'bytes', v_bytes,
                                   'since', v_prev.at, 'warn', c_tbl_growth))
        on conflict (ref) do nothing;
        if found then v_alerts := v_alerts + 1;
          raise warning '[cron-health] public.% grew % in 24h', r.relname, pg_size_pretty(v_delta); end if;
      end if;

      v_delta := v_rows - coalesce((v_prev.tables -> r.relname ->> 'r')::bigint, 0);
      if v_delta > c_rows_warn then
        v_sev := case when v_delta > c_rows_crit then 'critical' else 'warn' end;
        insert into public.maintenance_alerts (source, ref, severity, message, detail)
        values ('telemetry', 'table-rows:' || r.relname || ':' || v_day, v_sev,
                format('public.%s gained %s rows in 24h (now ~%s) — b319 wrote ~460k/day',
                       r.relname, v_delta, v_rows),
                jsonb_build_object('table', r.relname, 'row_delta', v_delta, 'rows', v_rows,
                                   'since', v_prev.at, 'warn', c_rows_warn))
        on conflict (ref) do nothing;
        if found then v_alerts := v_alerts + 1;
          raise warning '[cron-health] public.% gained % rows in 24h', r.relname, v_delta; end if;
      end if;
    end if;
  end loop;

  -- ── (f) CONNECTION HEADROOM ────────────────────────────────────────────
  -- The failure this watches for is TOTAL and takes the dashboard with it, so
  -- it alarms on the ratio rather than on a count: max_connections is a plan
  -- property and can change under us.
  if v_now.max_conns > 0
     and v_now.used_conns::numeric / v_now.max_conns::numeric > c_conn_warn then
    v_sev := case when v_now.used_conns::numeric / v_now.max_conns::numeric > c_conn_crit
                  then 'critical' else 'warn' end;
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
    values ('telemetry', 'connections:' || v_day, v_sev,
            format('%s of %s connections in use (%s%%) — every Edge Function call must go '
                   'through the transaction pooler on 6543 (server-authority.md 2a-ii)',
                   v_now.used_conns, v_now.max_conns,
                   round(100.0 * v_now.used_conns / v_now.max_conns)),
            jsonb_build_object('used', v_now.used_conns, 'max', v_now.max_conns))
    on conflict (ref) do nothing;
    if found then v_alerts := v_alerts + 1;
      raise warning '[cron-health] % of % connections in use', v_now.used_conns, v_now.max_conns; end if;
  end if;
  v_ph := v_ph || jsonb_build_object('checks', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int);
  v_t := clock_timestamp();

  -- ── RETENTION FOR THE DETECTOR'S OWN TABLES ────────────────────────────
  -- Nothing pruned these. 471 maintenance_log rows since 2026-08-11 is small,
  -- but "small and unbounded" is precisely what game_events was on day one, and
  -- a monitoring table that outgrows the thing it monitors is a bad joke.
  --
  -- 180 DAYS, AND THE NUMBER IS NOT MINE: docs/design/restore-runbook.md's
  -- retention audit already ruled on this gap — "one hr_maintenance_prune()
  -- retaining 180 days of maintenance_log and acked maintenance_alerts" — and a
  -- second author quietly picking 90 is how two policies for one table start.
  -- What DOES differ from that recommendation is the location: it lands inside
  -- the hourly detector rather than as a new function on a new cron slot,
  -- because it is two DELETEs against tables holding hundreds of rows and a
  -- scheduled job is a thing that can silently stop (which is check (b) of this
  -- very function). Same policy, one fewer moving part.
  --
  -- ⚠ ACKED ALERTS ONLY. An OPEN alert is never deleted by a timer — ageing out
  --   an alarm nobody has acknowledged is deleting the evidence of the thing you
  --   are watching for. bug_reports is deliberately untouched (player-reported
  --   evidence: curated, never aged out — the runbook's call, and it is right).
  delete from public.maintenance_log where ran_at < now() - interval '180 days';
  delete from public.maintenance_alerts
   where acked_at is not null and created_at < now() - interval '180 days';

  -- ── (h) THE SCHEDULER'S OWN RUN HISTORY (SERVER-PERF, 2027-01-01-server-perf.sql) ──
  -- pg_cron writes a row per run and prunes none: 494,460 rows / 79 MB since May (2026-10-24), every one
  -- of them seq-scanned by (a) and (b) every hour. Kept 7 days; deleted by runid range strictly below the
  -- oldest run that STARTED inside the window (runid is pg_cron's insert order and its only index), at most
  -- c_cron_prune_max a run. A new or running job's row is always above that floor. No run inside the window
  -- (the scheduler dead a week) = nothing pruned: the evidence stays. A failure here is an alert, never a
  -- failed detector.
  if to_regclass('cron.job_run_details') is not null then
    begin
      select min(d.runid) into v_lo from cron.job_run_details d;
      select d.runid into v_hi from cron.job_run_details d
       where d.start_time >= now() - c_cron_keep order by d.runid limit 1;
      if v_lo is not null and v_hi is not null and v_hi > v_lo then
        delete from cron.job_run_details d
         where d.runid >= v_lo and d.runid < least(v_hi, v_lo + c_cron_prune_max);
        get diagnostics v_pruned = row_count;
      end if;
    exception when insufficient_privilege then
      v_prune_err := left(sqlerrm, 300);
      insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('cron', 'cron-retention:' || v_day, 'warn',
              format('cron.job_run_details retention could not run (%s): the run history grows without '
                     'bound and this detector''s scans with it', v_prune_err),
              jsonb_build_object('error', v_prune_err, 'keep', c_cron_keep::text))
      on conflict (ref) do nothing;
      if found then v_alerts := v_alerts + 1;
        raise warning '[cron-health] cron.job_run_details retention could not run: %', v_prune_err; end if;
    end;
  end if;
  v_ph := v_ph || jsonb_build_object('retention', round(extract(epoch from clock_timestamp() - v_t) * 1000)::int,
                                     'total', round(extract(epoch from clock_timestamp() - v_t0) * 1000)::int);

  insert into public.maintenance_log (job, detail)
  values ('cron-health', jsonb_build_object(
    'alerts_raised', v_alerts, 'window', p_window::text,
    'db_bytes', v_now.db_bytes, 'conns', v_now.used_conns, 'max_conns', v_now.max_conns,
    'rate_window', v_prev.at,
    -- Recorded so a scaled PROBE run is never mistaken for a real one in the log.
    'scale', case when c_scale = 1.0 then null else c_scale end,
    -- SERVER-PERF: where this run's time went, and what (h) pruned.
    'phase_ms', v_ph, 'cron_pruned', v_pruned, 'cron_prune_error', v_prune_err,
    -- CRON-HEALTH-FAST: the runid (a) and (b) read from (0 = the whole history; null = no run history here).
    'cron_run_lo', v_run_lo));
  return v_alerts;
end;
$function$;

-- ── §5 THE WATCH ─────────────────────────────────────────────────────────────
-- p_conn_crit is the same seam as hr_cron_health_ex's p_scale: clamped, so it can only ever fire sooner.
create or replace function hr_ops.alert_watch(p_conn_crit numeric default 0.85)
returns jsonb language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare
  c_conn       constant numeric := least(0.85, greatest(0.000000001, coalesce(p_conn_crit, 0.85)));
  c_look_ahead constant numeric := 32;     -- tools/lib/hunt-lag.mjs LOOK_AHEAD_S: liveSeeds x 2 s
  c_stall_slack constant numeric := 15;    -- tools/lib/hunt-lag.mjs STALL_SLACK_S
  c_worst      constant numeric := 240;    -- past 125-130 s (a deferred selector, normal running), and past another flush
  v_flush numeric := 90; v_cadence numeric := 10; v_stall numeric;
  v_last timestamptz; v_fires3 int; v_good3 int; v_bad text;
  v_posted int; v_answers bigint; v_refused bigint; v_settled bigint; v_top text;
  v_open int; v_worst numeric; v_stalled int; v_watched int; v_freezing int;
  v_jobs jsonb; v_h jsonb; v_conns int; v_max int;
  v_silent numeric; v_on boolean;
  v_firing text[] := '{}';
begin
  select coalesce(c.flush_seconds, 90), coalesce(c.cadence_seconds, 10) into v_flush, v_cadence
    from public.hr_tick_config c where c.id;
  v_flush := coalesce(v_flush, 90); v_cadence := coalesce(v_cadence, 10);
  v_stall := v_flush + 2 * v_cadence + c_stall_slack;

  -- THE TICK. Its own log, the last quarter hour (the at index).
  select max(l.at),
         count(*) filter (where l.at > now() - interval '3 minutes'),
         count(*) filter (where l.at > now() - interval '3 minutes' and l.outcome in ('empty', 'posted', 'locked')),
         count(*) filter (where l.at > now() - interval '5 minutes' and l.outcome = 'posted'),
         coalesce(sum(coalesce((l.detail#>>'{edge,responses}')::bigint, 0) - coalesce((l.detail#>>'{edge,non_tick}')::bigint, 0))
                  filter (where l.at > now() - interval '5 minutes' and l.outcome = 'posted'), 0),
         coalesce(sum(coalesce((l.detail#>>'{edge,refused}')::bigint, 0)) filter (where l.at > now() - interval '5 minutes' and l.outcome = 'posted'), 0),
         coalesce(sum(coalesce((l.detail#>>'{edge,settled}')::bigint, 0)) filter (where l.at > now() - interval '5 minutes' and l.outcome = 'posted'), 0)
    into v_last, v_fires3, v_good3, v_posted, v_answers, v_refused, v_settled
    from public.hr_tick_cron_log l
   where l.at > now() - interval '15 minutes';
  v_silent := extract(epoch from now() - v_last);

  v_on := v_last is null or v_silent > 60;
  if v_on then v_firing := v_firing || 'tick-silent'::text; end if;
  perform hr_ops.alert_note('tick-silent', v_on, interval '60 seconds',
    format('World tick silent: last fire %s (it fires every %s s). Unwatched hunts and town work stop settling.',
           case when v_last is null then 'over 15 min ago' else round(v_silent) || ' s ago' end, v_cadence),
    jsonb_build_object('last', v_last));

  v_on := v_fires3 > 0 and v_good3 = 0;
  if v_on then
    select l.outcome into v_bad from public.hr_tick_cron_log l where l.at > now() - interval '15 minutes' order by l.at desc limit 1;
    v_firing := v_firing || 'tick-broken'::text;
  end if;
  perform hr_ops.alert_note('tick-broken', v_on, interval '60 seconds',
    format('World tick fires but cannot post: last outcome %s, %s fires in 3 min.', v_bad, v_fires3),
    jsonb_build_object('outcome', v_bad, 'fires', v_fires3));

  v_on := v_posted >= 3 and v_answers <= 0;
  if v_on then v_firing := v_firing || 'tick-unanswered'::text; end if;
  perform hr_ops.alert_note('tick-unanswered', v_on, interval '60 seconds',
    format('World tick posted %s times in 5 min and no tick answer came back: the edge is down, or pg_net is not delivering.', v_posted),
    jsonb_build_object('posted', v_posted));

  v_on := v_posted >= 3 and v_refused > 0 and v_settled = 0;
  if v_on then
    select l.detail#>>'{edge,top_reason}' into v_top from public.hr_tick_cron_log l
     where l.at > now() - interval '5 minutes' and l.detail#>>'{edge,top_reason}' is not null order by l.at desc limit 1;
    v_firing := v_firing || 'tick-refusing'::text;
  end if;
  perform hr_ops.alert_note('tick-refusing', v_on, interval '30 minutes',
    format('World tick is refused and settles nothing: %s refused in 5 min, 0 settled (top reason %s). Their time stays owed.', v_refused, coalesce(v_top, 'unknown')),
    jsonb_build_object('refused', v_refused, 'top_reason', v_top));

  -- THE HUNTS, in hunt-health's terms (tools/hunt-health.local.mjs, tools/lib/hunt-lag.mjs). WATCHED = a browser asked the
  -- accrue bucket for one of the instance's heroes in the last 2 minutes.
  select count(*), max(o.lag), count(*) filter (where o.lag > v_stall), count(*) filter (where o.watched),
         count(*) filter (where o.watched and o.lag > c_look_ahead)
    into v_open, v_worst, v_stalled, v_watched, v_freezing
    from (select i.id, extract(epoch from now() - i.settled_to) as lag,
                 bool_or(exists (select 1 from public.hr_rate_counters rc
                                  where rc.user_id = s.user_id
                                    and rc.bucket in ('accrue', 'accrue:' || s.slot)
                                    and rc.window_start > now() - interval '2 minutes')) as watched
            from public.hunt_sessions s
            join public.hunt_instances i on i.id = s.instance_id
           where s.ended_at is null
           group by i.id) o;

  v_on := coalesce(v_worst, 0) > c_worst or v_stalled > greatest(1, 0.1 * v_open);
  if v_on then v_firing := v_firing || 'hunts-stalled'::text; end if;
  perform hr_ops.alert_note('hunts-stalled', v_on, interval '2 minutes',
    format('Hunts stopped settling: %s of %s open hunts past %s s, worst %s s (last tick fire %s s ago).',
           v_stalled, v_open, v_stall, round(coalesce(v_worst, 0)), coalesce(round(v_silent)::text, '?')),
    jsonb_build_object('open', v_open, 'stalled', v_stalled, 'worst_s', round(coalesce(v_worst, 0))));

  v_on := v_freezing >= 2 and v_freezing >= 0.3 * v_watched;
  if v_on then v_firing := v_firing || 'hunts-freezing'::text; end if;
  perform hr_ops.alert_note('hunts-freezing', v_on, interval '3 minutes',
    format('Viewed hunts freezing: %s of %s watched hunts past the %s s look-ahead, worst %s s. Players'' screens are stalling.',
           v_freezing, v_watched, c_look_ahead, round(coalesce(v_worst, 0))),
    jsonb_build_object('watched', v_watched, 'freezing', v_freezing, 'worst_s', round(coalesce(v_worst, 0))));

  -- CRON. pg_cron's only index is runid; ~10 rows a minute, so 600 rows covers the 15 minutes.
  if to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('job', x.jobname, 'fails', x.fails, 'msg', x.msg) order by x.fails desc), '[]'::jsonb)
        from (select j.jobname, count(*) filter (where d.status = 'failed') as fails,
                     (array_agg(d.status order by d.runid desc) filter (where d.status in ('failed', 'succeeded')))[1] as latest,
                     (array_agg(left(d.return_message, 160) order by d.runid desc) filter (where d.status = 'failed'))[1] as msg
                from cron.job_run_details d
                join cron.job j on j.jobid = d.jobid
               where d.runid > (select coalesce(max(m.runid), 0) - 600 from cron.job_run_details m)
                 and d.start_time > now() - interval '15 minutes'
               group by j.jobname) x
       where x.fails >= 3 and x.latest = 'failed'
    $q$ into v_jobs;
  end if;
  v_on := jsonb_array_length(coalesce(v_jobs, '[]'::jsonb)) > 0;
  if v_on then v_firing := v_firing || 'cron-failing'::text; end if;
  perform hr_ops.alert_note('cron-failing', v_on, interval '0 seconds',
    format('Cron still failing: %s in 15 min, the last: %s',
           (select string_agg(j->>'job' || ' ' || (j->>'fails') || 'x', ', ') from jsonb_array_elements(coalesce(v_jobs, '[]'::jsonb)) j),
           v_jobs #>> '{0,msg}'),
    jsonb_build_object('jobs', v_jobs));

  -- CONNECTIONS, the hourly arm's own count and its 85 %, at minute cadence.
  select count(*)::int into v_conns from pg_stat_activity;
  select s.setting::int into v_max from pg_settings s where s.name = 'max_connections';
  v_on := v_max > 0 and v_conns::numeric / v_max::numeric > c_conn;
  if v_on then v_firing := v_firing || 'connections'::text; end if;
  perform hr_ops.alert_note('connections', v_on, interval '2 minutes',
    format('%s of %s database connections in use: new players and the tick are next to be refused.', v_conns, v_max),
    jsonb_build_object('used', v_conns, 'max', v_max));

  -- REALTIME: someone is here and nothing is decoding (the judge's rule; idle is not an alarm any more).
  v_h := public.hr_slot_health();
  v_on := exists (select 1 from jsonb_array_elements(coalesce(v_h->'alarms', '[]'::jsonb)) e where e->>'code' = 'no_pgoutput_slot');
  if v_on then v_firing := v_firing || 'realtime-no-slot'::text; end if;
  perform hr_ops.alert_note('realtime-no-slot', v_on, interval '4 minutes',
    'Realtime is not decoding: players are online and there is no replication slot. Live frames stop, screens fall back to the 16 s poll, chat stops arriving.',
    jsonb_build_object('slots', v_h->'slots'));

  return jsonb_build_object('firing', to_jsonb(v_firing), 'open_hunts', v_open, 'worst_lag_s', round(coalesce(v_worst, 0)));
end $fn$;

-- ── §6 THE RELAY ─────────────────────────────────────────────────────────────
-- A Vault read. Null when Vault or the row is absent. Never raises, never logs: the value is the secret.
create or replace function hr_ops.alert_secret(p_name text)
returns text language plpgsql stable set search_path = pg_catalog as $fn$
declare v text;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v using p_name;
  return nullif(v, '');
exception when others then
  return null;
end $fn$;

-- What may be sent out of the database: no url, connection string or token, whatever a job's error said.
create or replace function hr_ops.alert_scrub(p_text text)
returns text language sql immutable set search_path = pg_catalog as $fn$
  select regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
           '[a-zA-Z][a-zA-Z0-9+.-]*://[^[:space:]]+', '[url]', 'g'),
           'eyJ[A-Za-z0-9_-]{8,}[.A-Za-z0-9_-]*', '[token]', 'g'),
           'sb(p|_secret|_publishable)_[A-Za-z0-9_-]+', '[token]', 'g')
$fn$;

-- The ref with what changes each hour or run taken out: the unit a repeat is judged by.
create or replace function hr_ops.alert_class(p_ref text)
returns text language sql immutable set search_path = pg_catalog as $fn$
  select regexp_replace(regexp_replace(p_ref, '[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2})?', '*', 'g'), ':[0-9]+$', ':#')
$fn$;

-- One post. The request id, or null. SQLSTATE only: an error text may quote the url.
create or replace function hr_ops.alert_send(p_url text, p_content text)
returns bigint language plpgsql volatile set search_path = pg_catalog as $fn$
declare v_id bigint;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return null; end if;
  execute 'select net.http_post($1, $2, ''{}''::jsonb, ''{"Content-Type": "application/json"}''::jsonb, 5000)'
     into v_id
    using p_url, jsonb_build_object('content', left(p_content, 1900), 'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb));
  return v_id;
exception when others then
  return null;
end $fn$;

-- p_dry: no Vault read and no HTTP; every decision and row otherwise (the §10 self-check, inside its rollback).
create or replace function hr_ops.alert_relay(p_dry boolean default false)
returns jsonb language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare
  c_per_hour  constant int := 3;                     -- alert and clear posts in a rolling hour; one "and N more" besides
  c_cooldown  constant interval := interval '1 hour'; -- a class repeats at most this often
  c_attempts  constant int := 3;
  c_shape     constant text := '^https://(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$';
  v_url text; v_outcome text;
  v_state hr_ops.alert_relay_state%rowtype;
  v_pending int; v_recent int; v_new_posts int := 0; v_held int := 0; v_retried int := 0;
  r record; p record;
  v_kind text; v_class text; v_status int; v_timed boolean; v_found boolean; v_id bigint;
  v_cursor bigint;
begin
  select * into v_state from hr_ops.alert_relay_state where id for update;
  if not found then raise exception 'alert-relay: the state row is gone (§1 seeds it)'; end if;

  if not p_dry then
    v_url := hr_ops.alert_secret('hr_alert_discord_webhook');
    v_outcome := case when v_url is null then 'no_webhook' when v_url !~ c_shape then 'bad_webhook' end;
    if v_outcome is not null then
      v_url := null;
      select count(*) into v_pending from public.maintenance_alerts a
       where a.id > v_state.cursor_id and a.severity = 'critical' and a.acked_at is null;
      if v_state.noted_at is null or v_state.noted_at < now() - interval '1 hour' then
        insert into public.maintenance_log (job, detail)
          values ('alert-relay', jsonb_build_object('outcome', v_outcome, 'waiting', v_pending, 'secret', 'hr_alert_discord_webhook'));
        update hr_ops.alert_relay_state set noted_at = now() where id;
      end if;
      return jsonb_build_object('ok', false, 'outcome', v_outcome, 'waiting', v_pending);
    end if;
    v_url := v_url || '?wait=true';   -- 200 with a message, not a bare 204: a 204 would read as a non-tick answer in hr_tick_edge_harvest

    -- WHAT DISCORD ANSWERED. A dead hook is said once and not hammered; anything else is tried again.
    for p in select * from hr_ops.alert_relay_posts where done_at is null order by id limit 20 loop
      v_found := false; v_status := null; v_timed := false;
      if p.request_id is not null and to_regclass('net._http_response') is not null then
        execute 'select status_code, coalesce(timed_out, false), true from net._http_response where id = $1'
           into v_status, v_timed, v_found using p.request_id;
        v_found := coalesce(v_found, false);
      end if;
      if v_found and v_status between 200 and 299 then
        update hr_ops.alert_relay_posts set status = v_status, done_at = now() where id = p.id;
      elsif v_found and v_status in (401, 403, 404) then
        update hr_ops.alert_relay_posts set status = v_status, done_at = now() where id = p.id;
      elsif v_found or p.request_id is null or p.sent_at < now() - interval '2 minutes' then
        if p.attempts >= c_attempts then
          update hr_ops.alert_relay_posts set status = coalesce(v_status, status), done_at = now() where id = p.id;
        else
          v_id := hr_ops.alert_send(v_url, p.content);
          update hr_ops.alert_relay_posts
             set request_id = v_id, sent_at = now(), attempts = attempts + 1, status = coalesce(v_status, status) where id = p.id;
          v_retried := v_retried + 1;
        end if;
      end if;
    end loop;

    -- THE ONE "CONNECTED" LINE, so the channel is proved before it matters.
    if v_state.hello_at is null then
      insert into hr_ops.alert_relay_posts (kind, class, content, request_id, sent_at, attempts)
        values ('hello', 'hello', 'Hearthrise alarm relay connected. Critical alerts land here, 4 posts an hour at most.',
                hr_ops.alert_send(v_url, 'Hearthrise alarm relay connected. Critical alerts land here, 4 posts an hour at most.'), now(), 1);
      update hr_ops.alert_relay_state set hello_at = now() where id;
    end if;
  end if;

  -- THE NEW ROWS. The cursor moves past everything judged, posted or not: nothing queues behind a cap.
  select count(*) into v_recent from hr_ops.alert_relay_posts where at > now() - interval '1 hour' and kind in ('alert', 'clear');
  v_cursor := v_state.cursor_id;
  for r in select a.id, a.ref, a.severity, a.message, a.created_at from public.maintenance_alerts a
            where a.id > v_state.cursor_id
              and ((a.severity = 'critical' and a.acked_at is null) or a.ref like 'watch-clear:%')
            order by a.id limit 500 loop
    v_cursor := r.id;
    v_class := hr_ops.alert_class(r.ref);
    v_kind := case when r.ref like 'watch-clear:%' then 'clear' else 'alert' end;
    if v_kind = 'clear' and not exists (select 1 from hr_ops.alert_relay_posts x
          where x.kind = 'alert' and x.class = 'watch:' || split_part(r.ref, ':', 2) || ':#' and x.at > now() - interval '7 days') then
      continue;   -- the channel never heard of it: no clear to tell
    end if;
    if v_recent >= c_per_hour
       or (v_kind = 'alert' and exists (select 1 from hr_ops.alert_relay_posts x
             where x.kind = 'alert' and x.class = v_class and x.at > now() - c_cooldown)) then
      v_held := v_held + 1;
      update hr_ops.alert_relay_state set unsent = unsent + 1, unsent_since = coalesce(unsent_since, r.created_at) where id;
      continue;
    end if;
    insert into hr_ops.alert_relay_posts (kind, class, alert_id, content, request_id, sent_at, attempts, done_at)
      select v_kind, v_class, r.id, x.body, case when p_dry then null else hr_ops.alert_send(v_url, x.body) end, now(), 1,
             case when p_dry then now() end
        from (select case when v_kind = 'clear' then 'Cleared. ' || hr_ops.alert_scrub(r.message)
                          else '**CRITICAL** ' || hr_ops.alert_scrub(r.message) || E'\n' || v_class
                               || ', filed <t:' || floor(extract(epoch from r.created_at))::bigint || ':R>' end as body) x;
    v_recent := v_recent + 1;
    v_new_posts := v_new_posts + 1;
  end loop;
  if v_cursor > v_state.cursor_id then
    update hr_ops.alert_relay_state set cursor_id = v_cursor where id;
  end if;

  -- THE FINAL WORD: one "and N more" an hour, at the cap, or for repeats held half an hour.
  select * into v_state from hr_ops.alert_relay_state where id;
  if v_state.unsent > 0
     and (v_recent >= c_per_hour or v_state.unsent_since < now() - interval '30 minutes')
     and not exists (select 1 from hr_ops.alert_relay_posts x where x.kind = 'more' and x.at > now() - interval '1 hour') then
    insert into hr_ops.alert_relay_posts (kind, class, content, request_id, sent_at, attempts, done_at)
      select 'more', 'more', x.body, case when p_dry then null else hr_ops.alert_send(v_url, x.body) end, now(), 1,
             case when p_dry then now() end
        from (select format('...and %s more critical alerts since <t:%s:t>: repeats, or past the limit of posts an hour. The list: node tools/vitals.mjs',
                            v_state.unsent, floor(extract(epoch from v_state.unsent_since))::bigint) as body) x;
    update hr_ops.alert_relay_state set unsent = 0, unsent_since = null where id;
    v_new_posts := v_new_posts + 1;
  end if;

  delete from hr_ops.alert_relay_posts where at < now() - interval '30 days';
  v_url := null;
  return jsonb_build_object('ok', true, 'outcome', case when v_new_posts > 0 then 'posted' else 'idle' end,
                            'posted', v_new_posts, 'held', v_held, 'retried', v_retried);
end $fn$;

-- THE DEAD-MAN'S PING, https://hc-ping.com/<uuid> only. False when it is not set up; never raises.
create or replace function hr_ops.alert_deadman()
returns boolean language plpgsql volatile set search_path = pg_catalog as $fn$
declare v_url text := hr_ops.alert_secret('hr_alert_deadman_url');
begin
  if v_url is null or v_url !~ '^https://hc-ping\.com/[0-9a-fA-F-]{36}$' then return false; end if;
  if to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is null then return false; end if;
  execute 'select net.http_get($1, ''{}''::jsonb, ''{}''::jsonb, 5000)' using v_url;
  return true;
exception when others then
  return false;
end $fn$;

-- THE ONE JOB. Each step alone: a broken watch must not stop the relay telling of it, and a broken step means no ping,
-- so the dead-man hears what this cannot say. Returns nothing the cron history should keep (pg_cron records "1 row").
create or replace function hr_ops.alert_run()
returns boolean language plpgsql volatile set search_path = pg_catalog, public as $fn$
declare v_ok boolean := true; v_state text;
begin
  begin
    perform hr_ops.alert_watch();
  exception when others then
    v_ok := false;
    get stacked diagnostics v_state = returned_sqlstate;
    insert into public.maintenance_alerts (source, ref, severity, message, detail)
      values ('watch', 'watch-broken:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24'), 'critical',
              'The game watch itself failed (sqlstate ' || v_state || '): the conditions it covers are not being read.',
              jsonb_build_object('sqlstate', v_state))
      on conflict (ref) do nothing;
  end;
  begin
    perform hr_ops.alert_relay(false);
  exception when others then
    v_ok := false;
  end;
  if v_ok then perform hr_ops.alert_deadman(); end if;
  return v_ok;
end $fn$;

-- ── §7 THE JOB ───────────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron absent: schedule by hand: select cron.schedule(''hr-alert-relay'', ''* * * * *'', ''select hr_ops.alert_run()'')';
  else
    perform public.hr_cron_ensure('hr-alert-relay', '* * * * *', 'select hr_ops.alert_run()');
  end if;
end $mig$;

-- ── §8 THE 200 THAT WERE READ ────────────────────────────────────────────────
-- Classified in the header, on 2026-11-03: none of them is a live incident, and each class is either fixed or no longer
-- filed by this file. Acked, not deleted (kept 180 days, then the detector's own retention). The line is the newest alert when
-- this file FIRST ran (§1), so a second apply acks nothing filed since and writes nothing.
do $mig$
declare v_counts jsonb; v_n bigint; v_line bigint;
begin
  select triage_id into v_line from hr_ops.alert_relay_state where id;
  select jsonb_object_agg(c.class, c.n), coalesce(sum(c.n), 0) into v_counts, v_n
    from (select hr_ops.alert_class(a.ref) as class, count(*) as n from public.maintenance_alerts a
           where a.acked_at is null and a.id <= v_line group by 1) c;
  if v_n > 0 then
    update public.maintenance_alerts set acked_at = now() where acked_at is null and id <= v_line;
    insert into public.maintenance_log (job, detail) values ('alert-triage', jsonb_build_object('acked', v_n, 'classes', v_counts));
  end if;
end $mig$;

-- ── §9 GRANTS: NONE, AND THE DEFAULTS TAKEN AWAY ─────────────────────────────
-- Revoke from PUBLIC first (§2). hr_ops has no USAGE for anyone but its owner; these are the second lock.
revoke all on hr_ops.alert_relay_state, hr_ops.alert_relay_posts, hr_ops.watch_state from public, anon, authenticated, service_role;
revoke all on sequence hr_ops.alert_relay_posts_id_seq from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_note(text, boolean, interval, text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_watch(numeric) from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_secret(text) from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_scrub(text) from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_class(text) from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_send(text, text) from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_relay(boolean) from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_deadman() from public, anon, authenticated, service_role;
revoke execute on function hr_ops.alert_run() from public, anon, authenticated, service_role;
revoke execute on function public.hr_slot_health_judge(jsonb, jsonb, boolean, boolean) from public;
revoke execute on function public.hr_slot_health_judge(jsonb, jsonb, boolean, boolean) from anon, authenticated, service_role;
revoke execute on function public.hr_slot_health() from public;
revoke execute on function public.hr_slot_health() from anon, authenticated, service_role;
revoke execute on function public.hr_slot_health_alert() from public;
revoke execute on function public.hr_slot_health_alert() from anon, authenticated, service_role;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from public;
revoke execute on function public.hr_cron_health_ex(interval, numeric) from anon, authenticated, service_role;
do $mig$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function public.hr_slot_health_judge(jsonb, jsonb, boolean, boolean) from %I', v_role);
      execute format('revoke execute on function public.hr_slot_health() from %I', v_role);
      execute format('revoke execute on function public.hr_slot_health_alert() from %I', v_role);
    end if;
  end loop;
  -- The read-only role keeps its two reads (2026-10-07-frame-emit-online-only.sql §5), never the alert writer.
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    execute 'grant execute on function public.hr_slot_health_judge(jsonb, jsonb, boolean, boolean) to supabase_read_only_user';
    execute 'grant execute on function public.hr_slot_health() to supabase_read_only_user';
  end if;
end $mig$;

-- ── §10 SELF-CHECK (CLAUDE.md §4), EXECUTED, every row rolled back ───────────
-- NOTHING LEAVES THE DATABASE: the relay runs dry (no Vault read, no HTTP) and the watch is read against the real tables.
-- The sentinel rolls back its alert, state, post and sample rows. It reads every player table as counts only.
do $mig$
declare
  v_job record; v_r jsonb; v_h jsonb; v_n int; v_base bigint; v_ref text; i int; v_txt text;
begin
  begin
    -- v1 no client or engine role can run or read any of it.
    foreach v_txt in array array['anon', 'authenticated', 'service_role'] loop
      if has_schema_privilege(v_txt, 'hr_ops', 'USAGE')
         or has_function_privilege(v_txt, 'hr_ops.alert_run()', 'EXECUTE')
         or has_function_privilege(v_txt, 'hr_ops.alert_relay(boolean)', 'EXECUTE')
         or has_table_privilege(v_txt, 'hr_ops.alert_relay_posts', 'SELECT') then
        raise exception 'alert-relay §10 v1: % can reach the relay', v_txt; end if;
    end loop;

    -- v2 idle is not an alarm, and someone online with no slot is. A slot with its WAL low stays critical either way.
    v_h := public.hr_slot_health_judge('[]', '[]', false, false);
    if not (v_h->>'ok')::boolean or not (v_h->>'idle')::boolean then
      raise exception 'alert-relay §10 v2: nobody online and no slot should read ok and idle: %', v_h; end if;
    v_h := public.hr_slot_health_judge('[]', '[]', false, true);
    if (v_h->>'ok')::boolean or v_h#>>'{alarms,0,code}' is distinct from 'no_pgoutput_slot' then
      raise exception 'alert-relay §10 v2: someone online and no slot should alarm: %', v_h; end if;
    v_h := public.hr_slot_health_judge('[]', '[]', false, null);
    if (v_h->>'ok')::boolean then
      raise exception 'alert-relay §10 v2: an unread presence must fail towards the alarm'; end if;
    v_h := public.hr_slot_health_judge('[{"slot":"s","plugin":"pgoutput","wal_status":"reserved","safe_wal_size":1}]', '[]', false, false);
    if (v_h->>'ok')::boolean then
      raise exception 'alert-relay §10 v2: a slot with its WAL low must alarm whoever is online'; end if;

    -- v3 the fuses are the header's, and the detector runs clean on this database at scale 1.
    v_txt := (select prosrc from pg_proc where oid = 'public.hr_cron_health_ex(interval,numeric)'::regprocedure);
    if position('(6144::bigint * 1024 * 1024 * c_scale)' in v_txt) = 0 or position('(1536::bigint * 1024 * 1024 * c_scale)' in v_txt) = 0
       or position('(4096::bigint * 1024 * 1024 * c_scale)' in v_txt) = 0 or position('c_conn_crit      constant numeric := 0.85 * c_scale' in v_txt) = 0
       or position($q$c_cron_keep      constant interval := interval '3 days'$q$ in v_txt) = 0 then
      raise exception 'alert-relay §10 v3: the detector does not hold this file''s fuses'; end if;
    perform public.hr_cron_health_ex(interval '25 hours', 1.0);

    -- v4 one episode files once, only when sustained, and a clear acks it and says so.
    perform hr_ops.alert_note('selfcheck', true, interval '1 hour', 'selfcheck', '{}');
    if exists (select 1 from public.maintenance_alerts where ref like 'watch:selfcheck:%') then
      raise exception 'alert-relay §10 v4: filed before it was sustained'; end if;
    update hr_ops.watch_state set since = now() - interval '2 hours' where code = 'selfcheck';
    perform hr_ops.alert_note('selfcheck', true, interval '1 hour', 'selfcheck', '{}');
    perform hr_ops.alert_note('selfcheck', true, interval '1 hour', 'selfcheck', '{}');
    select count(*) into v_n from public.maintenance_alerts where ref like 'watch:selfcheck:%' and severity = 'critical';
    if v_n <> 1 then raise exception 'alert-relay §10 v4: one episode filed % rows', v_n; end if;
    perform hr_ops.alert_note('selfcheck', false, interval '1 hour', null, null);
    if exists (select 1 from public.maintenance_alerts where ref like 'watch:selfcheck:%' and acked_at is null)
       or not exists (select 1 from public.maintenance_alerts where ref like 'watch-clear:selfcheck:%') then
      raise exception 'alert-relay §10 v4: a clear did not ack and tell'; end if;

    -- v5 the cap: 12 classes in one go read 3 posts and one "and 9 more"; warn rows never post; nothing older than the cursor posts.
    -- (Only with no real post in the last hour: a re-apply during an incident would count its real posts against the cap.)
    if not exists (select 1 from hr_ops.alert_relay_posts where at > now() - interval '1 hour') then
      update hr_ops.alert_relay_state set cursor_id = coalesce((select max(id) from public.maintenance_alerts), 0), unsent = 0, unsent_since = null where id;
      insert into public.maintenance_alerts (source, ref, severity, message) values ('watch', 'selfcheck-warn:1', 'warn', 'not me');
      for i in 1 .. 12 loop
        v_ref := 'selfcheck-class-' || i || ':1';
        insert into public.maintenance_alerts (source, ref, severity, message) values ('watch', v_ref, 'critical', 'post https://example.invalid/secret ' || i);
      end loop;
      v_r := hr_ops.alert_relay(true);
      select count(*) into v_n from hr_ops.alert_relay_posts where kind = 'alert' and at > now() - interval '1 minute';
      if v_n <> 3 then raise exception 'alert-relay §10 v5: % alert posts past a cap of 3', v_n; end if;
      select count(*) into v_n from hr_ops.alert_relay_posts where kind = 'more' and content like '...and 9 more%';
      if v_n <> 1 then raise exception 'alert-relay §10 v5: no "and 9 more" (%)', v_r; end if;
      if exists (select 1 from hr_ops.alert_relay_posts where content like '%example.invalid%' or content like '%not me%') then
        raise exception 'alert-relay §10 v5: a url or a warn row reached the channel'; end if;
    end if;

    -- v6 the watch reads every real table without raising, and the relay's job is the one this file states.
    v_r := hr_ops.alert_watch();
    if to_regprocedure('cron.schedule(text,text,text)') is not null and to_regclass('cron.job') is not null then
      select schedule, command into v_job from cron.job where jobname = 'hr-alert-relay';
      if not found or v_job.schedule <> '* * * * *' or v_job.command <> 'select hr_ops.alert_run()' then
        raise exception 'alert-relay §10 v6: the job reads % / %', v_job.schedule, v_job.command; end if;
    end if;
    raise exception 'alert-relay-selfcheck-ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'alert-relay-selfcheck-ok' then raise; end if;
  end;
end $mig$;
