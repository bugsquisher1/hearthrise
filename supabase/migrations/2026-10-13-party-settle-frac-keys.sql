-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-13-party-settle-frac-keys.sql — A PARTY SETTLE CARRIES THE SAME
--                                         XP REMAINDERS A SOLO SETTLE DOES.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Lane C: Security GO, then the
-- Coordinator applies (tools/apply-migration.mjs, one file). It changes which
-- delta a PARTY settle forwards to hr_apply (XP, a ranked surface), so it moves
-- only on a GO. APPLY ORDER: LAST, after 2026-10-12-companion-xp-frac.sql — §0
-- refuses unless hr_apply already accepts BOTH keys, because §4(b) proves this
-- allowlist a subset of hr_apply's (Security S-1). DB-ONLY: no edge half.
--
-- ── THE DEFECT (P1 for M4, found by lane/b567-companion-frac) ───────────────
-- hr_party_tick_settle refuses every top-level delta key outside its own
-- `c_delta_ok` BY NAME (`unknown_delta_key`). That list was cut on 2026-09-23
-- from a solo combat settle's vocabulary and never grew. The engine now
-- proposes two more keys on a combat window:
--   xp_frac            (2026-10-09-xp-frac-carry.sql)        whenever any skill's
--                      carried remainder moved — i.e. on essentially EVERY
--                      window that pays XP;
--   companion_xp_frac  (2026-10-12-companion-xp-frac.sql)    whenever the
--                      equipped pet's remainder moved.
-- So from the moment those two files apply and the edge sees `frac` in the
-- projection, EVERY party settle (shadow and armed) is refused whole. Today it
-- is unreachable (combat is disarmed and party hunt start is gated on it); at
-- M4 it is every party, every window.
--
-- ── THE FIX, AND WHY THIS ONE ───────────────────────────────────────────────
-- ONE anchored edit: the two names join `c_delta_ok`. Nothing else in the body
-- moves. The settle does not interpret either key: on the ARMED branch it hands
-- the member's delta to hr_apply verbatim (step 9), and hr_apply is the one
-- place both keys are validated (object shape, catalogue skill / EQUIPPED
-- companion, numbers in [0,1) REFUSED never clamped, overwrite upsert). On the
-- SHADOW branch nothing is paid and the delta is journalled as a solo settle's.
--
-- Rejected alternative (pass-through, no name list): dropping `c_delta_ok` for
-- "whatever hr_apply accepts" would remove S-1's shadow guarantee — in SHADOW
-- the settle never calls hr_apply, so an unpayable key would accumulate 48 h of
-- parity evidence for a payload that cannot be paid — or would need the settle
-- to parse hr_apply's source text at runtime on every call. The explicit list
-- stays; what changes is that it is now checked against the engine's proposable
-- key set by a standing guard (tests/delta-key-allowlists.mjs), so the next key
-- cannot repeat this.
--
-- ── THE SINGLE-WRITER SCANS (Security-reviewed §4(b) in the two frac files) ─
-- Both frac files assert by pg_proc scan that no function body other than
-- hr_apply / hr_state_of NAMES `xp_frac` (their "exactly one writer" property).
-- This file makes hr_party_tick_settle name both keys — inside its refusal
-- allowlist, which writes nothing. On the FIRST apply of the chain the scans
-- run before this file and pass unchanged; but both frac files carry a STANDING
-- second-apply test on the FULL chain (tests/xp-frac-carry.mjs X6,
-- tests/companion-xp-frac.mjs C7), which would RAISE once this file is in. So
-- the two scans are narrowed — STRICTLY REQUIRED for their own idempotency, and
-- flagged for Security re-review — to ignore hr_party_tick_settle's
-- `c_delta_ok` DECLARATION and nothing else: any other mention in that body, or
-- any mention in any other body, still raises. §4(c) here asserts the same
-- narrowed property, so it is carried forward by the newest file in the chain.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Unchanged: lock order (party_hunt, party_tick_lease, members in (user, slot)
-- order), the CAS, the all-or-nothing fan-out and the window intent id are the
-- party-drop body's, byte for byte. The patch is re-entrant: §1 skips when the
-- installed body already carries the two names.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- None added. The settle is executable by hr_engine only (grants restated
-- exactly, revoke first); both keys reach no table except through hr_apply's
-- existing, reviewed validation; a forged out-of-range remainder through the
-- party door is refused by hr_apply and ends the window member_unpayable with
-- NOTHING paid (§4(e), executed).
--
-- ── COST (100x players) ─────────────────────────────────────────────────────
-- Zero rows, zero bytes: two more entries in a constant array that is scanned
-- once per delta key per member. The remainders ride the apply that already
-- writes XP, as on the solo path.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-execute the party-drop body (2026-10-08-world-tick-party-drop.sql §5,
-- md5 61a739fc) and restate the §6 grants. Nothing reads the two names but the
-- key check; no data is altered, no row written.
--
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_party_tick_settle (re-seed with
--   --live --write, why from --codediff: "two keys added to c_delta_ok").
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
declare
  v_settle text; v_apply text; v_md5 text; v_n int;
  c_anchor constant text := $anc$    'consec_falls','deaths','progress','hearthfind','tool_carry','journal'];$anc$;
begin
  if to_regprocedure('public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: hr_party_tick_settle is absent — apply 2026-10-08-world-tick-party-drop.sql first'; end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  -- BOTH keys must already be in hr_apply's allowlist AND validated there, or
  -- this file would widen the party door to a key nothing checks (S-1).
  if strpos(substring(regexp_replace(v_apply, '--[^\n]*', '', 'g') from 'c_delta_keys\s+constant\s+text\[\]\s*:=\s*array\[[^]]*\]'), $q$'xp_frac'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'xp_frac'$q$) = 0 then
    raise exception 'PRECONDITION: hr_apply does not accept and validate xp_frac — apply 2026-10-09-xp-frac-carry.sql first'; end if;
  if strpos(substring(regexp_replace(v_apply, '--[^\n]*', '', 'g') from 'c_delta_keys\s+constant\s+text\[\]\s*:=\s*array\[[^]]*\]'), $q$'companion_xp_frac'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'companion_xp_frac'$q$) = 0 then
    raise exception 'PRECONDITION: hr_apply does not accept and validate companion_xp_frac — apply 2026-10-12-companion-xp-frac.sql first'; end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_md5 from pg_proc p
   where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure;
  if v_md5 not in ('61a739fc33d1c60651ab30d1f7b4e5f4', '1d7153c183b87144003003861f24dbd1') then
    raise exception 'PRECONDITION: hr_party_tick_settle prosrc md5 is %, expected the live 61a739fc (party-drop) '
                    'or this file''s 1d7153c183b87144003003861f24dbd1. Re-cut this file against the live body.', v_md5; end if;
  if v_md5 = '61a739fc33d1c60651ab30d1f7b4e5f4' then
    v_settle := replace(pg_get_functiondef(
      'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure), chr(13), '');
    v_n := (length(v_settle) - length(replace(v_settle, c_anchor, ''))) / length(c_anchor);
    if v_n <> 1 then
      raise exception 'PRECONDITION: the c_delta_ok anchor appears % time(s) in hr_party_tick_settle, expected exactly 1', v_n; end if;
  end if;
end $mig$;

-- ── 1. hr_party_tick_settle — THE TWO REMAINDER KEYS JOIN c_delta_ok ────────
-- The comment inside the array carries no quote and no semicolon: §5(g) of
-- 2026-09-23-m8-parties-s2-2 and §4(b) below read the list back out of the
-- installed body as every quoted word up to the first semicolon.
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(substring(regexp_replace(v_def, '--[^\n]*', '', 'g') from 'c_delta_ok\s+constant\s+text\[\]\s*:=\s*array\[[^]]*\]'), $q$'companion_xp_frac'$q$) > 0 then
    raise notice 'hr_party_tick_settle already carries the remainder keys — patch skipped'; return; end if;
  v_def := replace(v_def,
    $anc$    'consec_falls','deaths','progress','hearthfind','tool_carry','journal'];$anc$,
    $anc$    'consec_falls','deaths','progress','hearthfind','tool_carry','journal',
    -- THE CARRIED XP REMAINDERS, absolute maps the engine proposes on any window
    -- that moved one (2026-10-13-party-settle-frac-keys.sql). Validated by
    -- hr_apply alone, which this settle hands the delta to verbatim
    'xp_frac','companion_xp_frac'];$anc$);
  execute v_def;
  raise notice 'hr_party_tick_settle patched: xp_frac and companion_xp_frac join c_delta_ok';
end $mig$;

-- ── 2. GRANTS — restated exactly as the chain left them (revoke first) ──────
revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) from public;
revoke execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb)
  from anon, authenticated, service_role, hr_tick;
grant  execute on function public.hr_party_tick_settle(text, uuid, timestamptz, timestamptz, uuid, jsonb) to hr_engine;

-- ── 4. SELF-CHECK (§4) — BY EXECUTION ───────────────────────────────────────
--   (a) the installed body is this file's (md5), and differs from party-drop's
--       ONLY by the two names (re-derived: undo the patch, compare md5)
--   (b) S-1: every name in c_delta_ok is in hr_apply's c_delta_keys, and both
--       remainder keys are in c_delta_ok
--   (c2) c_delta_ok is referenced only by its declaration and the key check
--   (c) the single-writer property, narrowed exactly as the two frac files'
--       §4(b) now are: outside hr_party_tick_settle's c_delta_ok declaration no
--       body but hr_apply / hr_state_of names xp_frac
--   (d) ARMED, a two-member party window carrying both keys PAYS, and each
--       member's XP, skill remainder, pet XP and pet remainder equal a SOLO
--       twin's after hr_apply of the same delta (party-split parity)
--   (e) an out-of-range remainder through the party door is refused by
--       hr_apply: member_unpayable, nothing paid for either member
--   (f) SHADOW, the same keys are accepted and journalled, nothing paid
--   (g) grants: hr_engine only; no client role, not hr_tick
-- Every fixture row is discarded by a sentinel raise (HR948); a leak check runs
-- after it; the config switches flipped are read back.
do $mig$
declare
  v_a   constant uuid := '00000000-0000-4000-c000-0000f7ac1301';
  v_b   constant uuid := '00000000-0000-4000-c000-0000f7ac1302';
  v_sa  constant uuid := '00000000-0000-4000-c000-0000f7ac1303';
  v_sb  constant uuid := '00000000-0000-4000-c000-0000f7ac1304';
  c_h   constant text := 'hr1013-frac-selfcheck';
  v_settle text; v_apply text; v_ok text[]; v_names text; t text;
  v_cact text; v_party uuid; v_hunt uuid; v_mark timestamptz; v_to timestamptz;
  v_r jsonb; v_da jsonb; v_db jsonb; v_members jsonb; v_x jsonb; v_y jsonb;
  v_l0 bigint; v_n bigint;
  v_en boolean; v_ch text[]; v_ar text[];
  v_en2 boolean; v_ch2 text[]; v_ar2 text[];
begin
  -- (a)
  select replace(p.prosrc, chr(13), '') into v_settle from pg_proc p
   where p.oid = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)'::regprocedure;
  if md5(v_settle) is distinct from '1d7153c183b87144003003861f24dbd1' then
    raise exception 'party-frac self-check (a): installed hr_party_tick_settle md5 is %, expected 1d7153c183b87144003003861f24dbd1', md5(v_settle); end if;
  if md5(replace(v_settle, $anc$'journal',
    -- THE CARRIED XP REMAINDERS, absolute maps the engine proposes on any window
    -- that moved one (2026-10-13-party-settle-frac-keys.sql). Validated by
    -- hr_apply alone, which this settle hands the delta to verbatim
    'xp_frac','companion_xp_frac'];$anc$, $anc$'journal'];$anc$))
     is distinct from '61a739fc33d1c60651ab30d1f7b4e5f4' then
    raise exception 'party-frac self-check (a): undoing the two names does not give back party-drop''s body — something else moved'; end if;

  -- (b) S-1, read back out of BOTH installed bodies.
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  select array(select m[1] from regexp_matches(substring(regexp_replace(v_settle, '--[^\n]*', '', 'g') from 'c_delta_ok\s+constant\s+text\[\]\s*:=\s*array\[[^]]*\]'),
                                               '''([a-z_]+)''', 'g') m order by 1) into v_ok;
  if not ('xp_frac' = any (v_ok)) or not ('companion_xp_frac' = any (v_ok)) or cardinality(v_ok) <> 15 then
    raise exception 'party-frac self-check (b): c_delta_ok reads back as % — expected the 13 combat keys plus both remainders', v_ok; end if;
  foreach t in array v_ok loop
    if strpos(substring(regexp_replace(v_apply, '--[^\n]*', '', 'g') from 'c_delta_keys\s+constant\s+text\[\]\s*:=\s*array\[[^]]*\]'), '''' || t || '''') = 0 then
      raise exception 'party-frac self-check (b): the party settle accepts "%" and hr_apply''s c_delta_keys does not (S-1)', t; end if;
  end loop;

  -- (c)
  select string_agg(distinct p.proname, ',' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join lateral (select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as code) c
   where n.nspname = 'public'
     and (case when p.proname = 'hr_party_tick_settle'
                    -- the carve-out holds only while c_delta_ok is used in
                    -- exactly two places, its declaration and the key check,
                    -- so a writer that reads a name out of it (format %I) is
                    -- scanned in full (Security, 2026-10-13 #4)
                    and (length(c.code) - length(replace(c.code, 'c_delta_ok', ''))) / 10 = 2
                    and strpos(c.code, 'k = any (c_delta_ok)') > 0
               then regexp_replace(p.prosrc, 'c_delta_ok\s+constant\s+text\[\]\s*:=\s*array\[[^]]*\];', '')
               else p.prosrc end) like '%xp\_frac%'
     and p.proname not in ('hr_apply', 'hr_state_of');
  if v_names is not null then
    raise exception 'party-frac self-check (c): outside the party allowlist, functions other than hr_apply / hr_state_of '
                    'name xp_frac: % — the remainder must have exactly one writer', v_names; end if;
  if strpos(regexp_replace(v_settle, 'c_delta_ok\s+constant\s+text\[\]\s*:=\s*array\[[^]]*\];', ''), 'xp_frac') > 0 then
    raise exception 'party-frac self-check (c): hr_party_tick_settle names xp_frac outside its c_delta_ok declaration'; end if;
  -- (c2) c_delta_ok is used in EXACTLY two places — its declaration and the key
  --      check — so no code reads a name out of it to write with (Security,
  --      2026-10-13 #4: a `format('%I', c_delta_ok[n])` writer).
  v_apply := regexp_replace(v_settle, '--[^\n]*', '', 'g');
  if (length(v_apply) - length(replace(v_apply, 'c_delta_ok', ''))) / 10 <> 2
     or strpos(v_apply, 'k = any (c_delta_ok)') = 0
     or v_apply !~ 'c_delta_ok\s+constant\s+text\[\]\s*:=\s*array\[' then
    raise exception 'party-frac self-check (c2): c_delta_ok is referenced outside its declaration and the key check'; end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  -- (g)
  if has_function_privilege('anon', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute')
     or has_function_privilege('hr_tick', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)', 'execute') then
    raise exception 'party-frac self-check (g): hr_party_tick_settle is not hr_engine-only'; end if;

  select enabled, channels, armed_channels into v_en, v_ch, v_ar from public.hr_tick_config where id;
  if not found then raise exception 'party-frac self-check: hr_tick_config has no row'; end if;

  begin
    update public.hr_tick_config
       set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat'] where id;
    select activity_id into v_cact from public.hr_activities where kind = 'combat' order by activity_id limit 1;
    if v_cact is null then raise exception 'party-frac self-check: hr_activities has no combat row'; end if;

    -- Four characters in one identical state: A and B hunt as a party, SA and
    -- SB are their solo twins. Every one has the Fox equipped and a carried
    -- remainder on attack, so the deltas below OVERWRITE a non-zero value.
    v_mark := date_trunc('second', now()) - interval '5 minutes';
    v_to   := v_mark + interval '90 seconds';
    insert into auth.users (id) values (v_a), (v_b), (v_sa), (v_sb) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                     active_kind, active_id, active_since, consec_falls, companion_equipped)
    select u, 0, 500, 0, 10, 10, 1, v_mark, 'combat', v_cact, '2000-01-01 00:00:00+00', 0, 'fox'
      from unnest(array[v_a, v_b, v_sa, v_sb]) u;
    insert into public.player_skills (user_id, slot, skill_id, xp, xp_frac)
    select u, 0, 'attack', 40, 0.9 from unnest(array[v_a, v_b, v_sa, v_sb]) u;
    insert into public.party (leader_user, leader_slot) values (v_a, 0) returning id into v_party;
    insert into public.party_member (party_id, user_id, slot, role, joined_at)
    values (v_party, v_a, 0, 'leader', now() - interval '2 hours'),
           (v_party, v_b, 0, 'member', now() - interval '1 hour');
    insert into public.party_hunt (party_id, active_id, accrued_to) values (v_party, v_cact, v_mark)
      returning id into v_hunt;
    insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until)
    values (v_party, true, c_h, now() + interval '5 minutes')
    on conflict (party_id) do update set owned = true, lease_holder = c_h, lease_until = now() + interval '5 minutes';

    -- Two DIFFERENT member deltas (a split hands each member their own share),
    -- each carrying both remainder keys beside the XP and pet XP they belong to.
    v_da := jsonb_build_object('gold', 9, 'accrued_to', v_to,
      'xp', jsonb_build_object('attack', 7, 'strength', 3),
      'xp_frac', jsonb_build_object('attack', 0.125, 'strength', 0.5),
      'progress', jsonb_build_array(jsonb_build_object('kind', 'stat', 'key', 'companion_xp:fox',
                                    'period', '', 'add', 2, 'state', 'active')),
      'companion_xp_frac', jsonb_build_object('fox', 0.5),
      'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue', 'meta', jsonb_build_object('src', 'tick', 'ticks', 1)));
    v_db := jsonb_build_object('gold', 4, 'accrued_to', v_to,
      'xp', jsonb_build_object('attack', 3),
      'xp_frac', jsonb_build_object('attack', 0.75),
      'progress', jsonb_build_array(jsonb_build_object('kind', 'stat', 'key', 'companion_xp:fox',
                                    'period', '', 'add', 1, 'state', 'active')),
      'companion_xp_frac', jsonb_build_object('fox', 0.25),
      'journal', jsonb_build_object('kind', 'combat', 'intent', 'accrue', 'meta', jsonb_build_object('src', 'tick', 'ticks', 1)));
    v_members := jsonb_build_array(
      jsonb_build_object('user', v_a, 'slot', 0, 'version', 1,
        'delta', jsonb_set(v_da, '{journal,meta,party}', jsonb_build_object('id', v_party, 'hunt', v_hunt,
          'dmg_bp', 6000, 'xp_bp', 6000, 'floor', 0, 'fellow_bp', 1500, 'roll', 7))),
      jsonb_build_object('user', v_b, 'slot', 0, 'version', 1,
        'delta', jsonb_set(v_db, '{journal,meta,party}', jsonb_build_object('id', v_party, 'hunt', v_hunt,
          'dmg_bp', 4000, 'xp_bp', 4000, 'floor', 0, 'fellow_bp', 1500, 'roll', 7))));

    -- (e) FIRST, on the clean fixture: an out-of-range remainder through the
    --     party door. hr_apply refuses it, the fan-out rolls back whole.
    select count(*) into v_l0 from public.player_ledger where user_id in (v_a, v_b);
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, gen_random_uuid(),
             jsonb_set(v_members, '{1,delta,xp_frac,attack}', '1'::jsonb));
    reset role;
    select count(*) into v_n from public.player_ledger where user_id in (v_a, v_b);
    if v_r->>'error' is distinct from 'member_unpayable' or v_r#>>'{member,error}' is distinct from 'bad_xp_frac'
       or v_n <> v_l0
       or (select gold from public.player_state where user_id = v_a) <> 500
       or (select xp_frac from public.player_skills where user_id = v_b and skill_id = 'attack') <> 0.9 then
      raise exception 'party-frac self-check (e): an xp_frac of 1 through the party door was not refused whole by hr_apply: %', v_r; end if;
    -- member_unpayable ends the hunt; re-open it for (d).
    update public.party_hunt set ended_at = null, stopped_by = null where id = v_hunt;

    -- (d) ARMED: the honest window pays both members.
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_mark, v_to, gen_random_uuid(), v_members);
    reset role;
    if coalesce(v_r->>'ok', 'false') <> 'true' or coalesce(v_r->>'paid', 'false') <> 'true' then
      raise exception 'party-frac self-check (d): a party window carrying xp_frac + companion_xp_frac was REFUSED: %', v_r; end if;
    -- The twins: the same deltas, WITHOUT the party attribution, through the
    -- solo door every other settle uses.
    set local role hr_engine;
    v_r := public.hr_apply(v_sa, 0, 1, gen_random_uuid(), v_da);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      reset role; raise exception 'party-frac self-check (d): the solo twin A was refused: %', v_r; end if;
    v_r := public.hr_apply(v_sb, 0, 1, gen_random_uuid(), v_db);
    reset role;
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'party-frac self-check (d): the solo twin B was refused: %', v_r; end if;
    for v_x, v_y in
      select (select jsonb_build_object(
                'gold', ps.gold,
                'skills', (select jsonb_object_agg(sk.skill_id, jsonb_build_array(sk.xp, sk.xp_frac))
                             from public.player_skills sk where sk.user_id = ps.user_id and sk.slot = 0),
                'pet', (select jsonb_build_array(pp.value, pp.xp_frac) from public.player_progress pp
                         where pp.user_id = ps.user_id and pp.slot = 0 and pp.kind = 'stat'
                           and pp.key = 'companion_xp:fox' and pp.period_key = ''))
                from public.player_state ps where ps.user_id = pr.p and ps.slot = 0),
             (select jsonb_build_object(
                'gold', ps.gold,
                'skills', (select jsonb_object_agg(sk.skill_id, jsonb_build_array(sk.xp, sk.xp_frac))
                             from public.player_skills sk where sk.user_id = ps.user_id and sk.slot = 0),
                'pet', (select jsonb_build_array(pp.value, pp.xp_frac) from public.player_progress pp
                         where pp.user_id = ps.user_id and pp.slot = 0 and pp.kind = 'stat'
                           and pp.key = 'companion_xp:fox' and pp.period_key = ''))
                from public.player_state ps where ps.user_id = pr.s and ps.slot = 0)
        from (values (v_a, v_sa), (v_b, v_sb)) pr(p, s)
    loop
      if v_x is distinct from v_y then
        raise exception 'party-frac self-check (d): a party member and their solo twin differ: party % solo %', v_x, v_y; end if;
    end loop;
    if (select jsonb_build_array(xp, xp_frac) from public.player_skills where user_id = v_a and skill_id = 'attack')
         is distinct from '[47, 0.125]'::jsonb
       or (select jsonb_build_array(value, xp_frac) from public.player_progress
            where user_id = v_b and kind = 'stat' and key = 'companion_xp:fox' and period_key = '')
         is distinct from '[1, 0.25]'::jsonb then
      raise exception 'party-frac self-check (d): the party credit is not the proposed one (A attack, B fox)'; end if;

    -- (f) SHADOW: the same vocabulary is accepted, journalled, and pays nothing.
    update public.hr_tick_config set armed_channels = '{}' where id;
    select count(*) into v_l0 from public.player_ledger where user_id in (v_a, v_b);
    select jsonb_agg(jsonb_set(jsonb_set(m, '{version}', to_jsonb(ps.version)),
                               '{delta,accrued_to}', to_jsonb(v_to + interval '90 seconds')))
      into v_members
      from jsonb_array_elements(v_members) m
      join public.player_state ps on ps.user_id = (m->>'user')::uuid and ps.slot = 0;
    set local role hr_engine;
    v_r := public.hr_party_tick_settle(c_h, v_party, v_to, v_to + interval '90 seconds', gen_random_uuid(),
                                       v_members);
    reset role;
    select count(*) into v_n from public.player_ledger where user_id in (v_a, v_b);
    if coalesce(v_r->>'ok', 'false') <> 'true' or v_r->>'mode' is distinct from 'shadow'
       or (v_r->>'journalled')::int <> 2 or v_n <> v_l0 then
      raise exception 'party-frac self-check (f): a SHADOW window carrying both remainders was not accepted, journalled '
                      'and unpaid: %', v_r; end if;

    raise exception using errcode = 'HR948', message = 'party-settle-frac-keys §4 complete — rolling back';
  exception when sqlstate 'HR948' then null;
  end;

  select enabled, channels, armed_channels into v_en2, v_ch2, v_ar2 from public.hr_tick_config where id;
  if v_en2 is distinct from v_en or v_ch2 is distinct from v_ch or v_ar2 is distinct from v_ar then
    raise exception 'party-frac self-check: hr_tick_config was not restored'; end if;
  if exists (select 1 from public.player_state where user_id in (v_a, v_b, v_sa, v_sb))
     or exists (select 1 from public.player_skills where user_id in (v_a, v_b, v_sa, v_sb))
     or exists (select 1 from public.player_progress where user_id in (v_a, v_b, v_sa, v_sb))
     or exists (select 1 from public.player_ledger where user_id in (v_a, v_b, v_sa, v_sb))
     or exists (select 1 from public.party where leader_user = v_a)
     or exists (select 1 from public.hr_tick_shadow where user_id in (v_a, v_b))
     or exists (select 1 from auth.users where id in (v_a, v_b, v_sa, v_sb)) then
    raise exception 'party-frac self-check: §4 LEAKED a probe row'; end if;

  raise notice 'party-settle-frac-keys self-check PASSED: (a) the body is party-drop''s plus two names; (b) c_delta_ok '
               'is a subset of hr_apply''s c_delta_keys and carries both remainders (S-1); (c) outside that '
               'declaration only hr_apply / hr_state_of name xp_frac; (d) an armed two-member window carrying both '
               'keys paid each member exactly what a solo hr_apply of the same delta paid their twin; (e) an '
               'out-of-range remainder through the party door was refused by hr_apply, nothing paid; (f) shadow '
               'accepted and journalled the same keys, nothing paid; (g) hr_engine-only';
end $mig$;
