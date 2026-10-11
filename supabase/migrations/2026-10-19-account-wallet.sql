-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-19-account-wallet.sql — GEMS AND THE HEARTH TOKEN BOND ARE ONE
--   ACCOUNT-WIDE WALLET. GOLD STAYS PER HERO.
--
-- STATUS: STAGED, NOT APPLIED — REVIEW ONLY. Lane C (lane/c-account-wallet).
-- MONEY SURFACE: it moves every gem balance, every gem grant and every gem
-- spend. Security GO, then the Coordinator applies (tools/apply-migration.mjs,
-- one file, never inside begin/commit, never 00:00–00:10 UTC). EDGE HALF:
-- supabase/functions/hr-accrue/claim-reward.js reports `granted.gems` from the
-- apply's `gems_paid` (deploy after this file). No client contract change: the
-- envelope keeps `gems` and `hearth_tokens`, now the account's.
-- CHAIN POSITION: after 2026-10-11-name-moderation.sql (Security ordering
-- ruling 2026-10-11). hr_state_of is restated from the POST-moderation body
-- (`must_rename` kept, §8 v3c) and §0 accepts only that body; the other ten
-- pins equal production as measured read-only on 2026-10-11.
--
-- ── THE RULING (Game Designer, final, 2026-10-11) ──────────────────────────
--   Gems and Hearth Tokens are ONE balance per account (Idle Clans). Why: hero
--   slots are already account-wide (character_slot:<n> flags on slot 0) while
--   hr_buy_hero_slot charged the PLAYING hero's player_state.gems — production
--   on 2026-10-11 held 14 gems on one hero of an account and 534 on another —
--   and every per-hero gem source paid up to 5x per account.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 public.account_wallet(user_id PK -> auth.users, gems >= 0,
--    hearth_tokens >= 0, version, updated_at). public.account_gem_grants
--    (user_id, grant_key) PK — the ONCE-PER-ACCOUNT key of every gem credit;
--    slot is recorded, never keyed. Both: RLS forced, zero policies, no client,
--    engine or tick privilege. Written ONLY by the §3 helpers.
-- §2 player_ledger.kind admits 'wallet'; partial index on gem inflows.
-- §3 THE CHOKE POINT — owner-executable only, called by definer RPCs:
--      hr_wallet_ensure(uid)
--      hr_wallet_credit(uid, slot, gems>0, grant_key, expires_at|null) -> jsonb
--        {ok, paid, balance, version} | {ok, paid:0, already:true, balance}
--        raises HR000 daily_budget {dim:'gems', scope:'account'} past the cap
--      hr_wallet_debit(uid, slot, gems>0, intent, meta) -> jsonb
--        {ok, balance, version} | {ok:false, error:'insufficient_gems', have, need}
--    Every movement writes exactly ONE player_ledger row, kind='wallet', on the
--    ACTING hero's slot (provenance), meta.gems = the SIGNED movement,
--    meta.balance = the wallet after it, gems_in = the inflow (0 on a debit).
--    LEDGER CONVENTION: only kind='wallet' rows carry meta.gems; a purchase or
--    claim row may echo `gems_paid` and never `gems`, so an account's gem
--    history is one kind across every slot and cannot be summed twice.
-- §4 RESTATED WHOLE (each pinned to the replayed pre-image = production):
--    hr_buy_hero_slot__ungated, hr_buy_gem_unlock__ungated (debit the wallet),
--    hr_claim_goal__ungated ('goal:<id>:<period>'), hr_claim_milestone__ungated
--    ('milestone:<id>'), hr_claim_rank__ungated ('rank:<id>'),
--    raid_claim__ungated ('raid:<week>'), world_event_claim__ungated
--    ('world_event:<day>'), hr_create_character ('start_kit'), hr_state_of
--    (projects the wallet on every slot), hr_day_budget_used (gem dimension
--    summed over the ACCOUNT), hr_ledger_prune (kind='wallet' rows are never
--    pruned: the rollup keeps only gems_in, so a pruned debit or carry would
--    vanish — Security F2). A second hero claiming an already-paid reward is
--    paid its gold and 0 gems; the receipt says 0.
--    LOCK RULE (Security C1): every caller of hr_wallet_debit takes the ACCOUNT
--    advisory lock (uid:0) before anything else; §8 k5(c) asserts it.
-- §5 hr_apply: FIVE anchored edits (gem block -> credit-only; no column write;
--    its own ledger row gems_in 0; the wallet credit keyed
--    'apply:<journal.intent>'; `gems_paid` on the envelope). The engine never
--    spends gems — a negative gem delta is bad_delta.
-- §6 THE CARRY AND THE DROP, ONE STATEMENT: every account's per-hero gems and
--    hearth_tokens are SUMMED into its wallet ONCE (production 2026-10-11: 837
--    gems over 46 heroes / 44 accounts, 0 tokens), journalled as one
--    kind='wallet' row per account (meta.carry = the per-slot balances,
--    gems_in 0 — a carry is not an inflow), then player_state.gems and
--    player_state.hearth_tokens are DROPPED. The beta is wiped at Early Access;
--    the carry exists so current testers lose nothing in between.
-- §3b the three helpers are revoked from PUBLIC at creation; every restated
--    body is followed by its own revoke-then-grant, restating its CURRENT ACL
--    (measured equal on the replay and production 2026-10-11: hr_state_of ->
--    hr_engine, hr_create_character -> authenticated, the rest owner-only).
-- §8 self-check, executed, rolled back.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   LOCK ORDER (house): account advisory (uid:0) -> character advisory
--   (uid:slot) -> character row -> WALLET ROW. The wallet row is a LEAF: no
--   helper takes any lock after it, so two heroes of one account racing (hero
--   A in hr_apply, hero B buying a slot) queue on the wallet row and cannot
--   cycle. The grant key is checked and inserted UNDER the wallet row lock, so
--   two characters claiming the same reward serialise and exactly one is paid.
--   The day cap is read under the same lock: two racing credits cannot both
--   fit under it.
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
--   Credits: the grant key (account-unique) — a replay pays 0. Debits: the
--   caller's own player_intents key (unchanged in both purchase RPCs).
--   Re-applying this file: §0 pins accept the pre- OR this file's post-image;
--   §1/§2 if-not-exists; §3/§4 identical create-or-replace; §5 skips when its
--   marker is present; §6 skips once the column is gone. Byte-identical second
--   apply (tests/schema-drift.mjs).
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +0 client RPCs. The three helpers are owner-only (aclexplode-asserted in §8
--   k1). Every gem grant that paid up to 5x per account now pays once. The gem
--   day ceiling (5,000) covers every gem source on the account, not only
--   engine applies, and not per hero.
-- ── COST (100x players, ~4,400 accounts) ────────────────────────────────────
--   account_wallet: one ~70-byte row per account. account_gem_grants: permanent
--   keys (ranks, milestones, start kit) ~20 per account for life; periodic
--   keys (goals, login, events, raids) carry expires_at and are pruned by the
--   next credit on the same account (bounded by ~10 live keys per account,
--   ~4 MB total). player_ledger: +1 row per gem movement (a few per account
--   per day), never per tick.
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   NOT REVERSIBLE BY RE-RUNNING AN OLD FILE: the columns are dropped. The way
--   back is a forward migration: re-add player_state.gems/hearth_tokens, copy
--   each wallet to the account's slot 0, restate the eleven bodies from their
--   pre-images (pinned in §0 by md5; the replay of the chain without this file
--   reproduces them byte-for-byte). Every movement is journalled, so no balance
--   can be lost in either direction.
-- ── INTERLOCKS (staged lanes that grant gems; NOT on this branch) ──────────
--   2026-10-18-discord-gift.sql (lane/b567-discord-join) credits
--   player_state.gems and its §8 inserts it: after this file it FAILS TO APPLY
--   (column absent) until it credits through
--   hr_wallet_credit(uid, slot, 25, 'discord_gift', null). 2026-10-16-login-
--   reward.sql (lane/w0c-daily-and-login) patches hr_apply's progress_claim
--   anchor (untouched here) and reads gems_in per (user, slot) in
--   hr_login_bonus_ready: it must read the ACCOUNT (kind='wallet' rows, any
--   slot). Both branches conflict with origin/main today and were not merged.
--   b570 BUNDLE (set/b570-bundle): this file now follows muster-chest-xp-credit,
--   rally-points-server and quest-xp-absence-pay; world_event_claim__ungated is
--   restated from rally-points-server's body (§0). The absence claim's gem moves
--   to the wallet in 2026-10-19-absence-claim-wallet.sql, applied IMMEDIATELY
--   after this file (Security F1); discord-gift and the w0c files follow it, and
--   2026-10-16-w0f-fun-content.sql restates hr_claim_milestone__ungated from
--   this file's post-image.
--
-- RESTATEMENT-DEBT-ACK: hr_apply (173 kB, the money body) takes five anchored gem edits here because restating it whole in the same lane as a currency move is the larger risk; every other gem body is restated whole and pinned, and slice 7 owns the hr_apply restatement.
--
-- ⚠ AFTER APPLYING: live-hash-drift wants hr_apply + the ten restated bodies +
--   the three helpers; restore-census classifies account_wallet and
--   account_gem_grants; deploy hr-accrue (claim-reward.js gems_paid).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
-- Each restated body must be EXACTLY the replayed pre-image (which production
-- carries: live-hash-drift measured live = replay for all eleven, 2026-10-11) or
-- this file's own post-image (a second apply). Anything else means another lane
-- moved a gem body in the meantime: refuse, never clobber (the b484–b487 class).
do $$
declare v_md5 text;
begin
  if to_regclass('public.player_state') is null or to_regclass('public.player_ledger') is null
     or to_regclass('public.hr_start_kit') is null or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: player_state / player_ledger / hr_start_kit / hr_client_rpc_baseline absent';
  end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regprocedure('public.hr_day_budget_limits()') is null
     or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: hr_reject / hr_day_budget_limits / hr_utc_day_start / hr_assert_grant_hygiene absent';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.player_ledger'::regclass
                    and conname = 'player_ledger_kind_check') then
    raise exception 'PRECONDITION: player_ledger_kind_check absent';
  end if;
  -- One pin per body, each in the literal shape tests/live-hash-drift.mjs reads.
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)'));
  if v_md5 is null or v_md5 not in ('00d63060177846986a2fdac73ba9d42e', '8b8b313c56b88dd5030cd884ede7307a') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_buy_gem_unlock__ungated(text,integer,uuid)'));
  if v_md5 is null or v_md5 not in ('f34d4123dc5e70718b11f0a0279f046d', '6c14c0acf21c5a10cecf506c201cf11a') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_buy_gem_unlock__ungated(text,integer,uuid)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_claim_goal__ungated(text,boolean,integer,uuid)'));
  if v_md5 is null or v_md5 not in ('80b1fd5a53fbd7af1492588e820634b1', 'e8636e76e6679a9ad4bacc32e55991d7') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_claim_goal__ungated(text,boolean,integer,uuid)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_claim_milestone__ungated(text,integer)'));
  if v_md5 is null or v_md5 not in ('1458baf317d9021fae80eaeccb4f70aa', 'd67a74d12284e0a01718918f32cb5548') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_claim_milestone__ungated(text,integer)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_claim_rank__ungated(text,integer)'));
  if v_md5 is null or v_md5 not in ('413addd68e6f99c04a04291bf2ec2b15', '6443d6de82a1e62846e4dfed799ea092') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_claim_rank__ungated(text,integer)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.raid_claim__ungated(text,uuid,text,integer)'));
  -- Three accepted: the replay's text; PRODUCTION's, which is the same code with
  -- its comments stripped (measured read-only 2026-10-11: 005a005a…;
  -- tests/live-hash-drift.baseline.json raid_claim__ungated: VERIFIED
  -- CODE-IDENTICAL by --codediff); and this file's post-image.
  if v_md5 is null or v_md5 not in ('638a554d174aa7668715822c4173368b', '005a005a20c0eb2ec69ed67456b8f82c',
                                     '8625b0d5d4aeabcffb1ce1452a0b8994') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.raid_claim__ungated(text,uuid,text,integer)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.world_event_claim__ungated(text,integer)'));
  -- POST-RALLY ONLY (b570 bundle): the chain is w0a-catalogue-cuts (Muster
  -- Seal cut, b2a71614…) -> muster-chest-xp-credit (XP credit) ->
  -- rally-points-server (points from the journal, 7919d955…). This file is
  -- restated from that last body; restating over any earlier one would undo
  -- a cut, the XP credit or the server-derived points.
  if v_md5 is null or v_md5 not in ('7919d955630bd87862f4e9e64d42fa62', '4358d8a73b95b0c6e96337e6682218d6') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.world_event_claim__ungated(text,integer)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_create_character(integer)'));
  if v_md5 is null or v_md5 not in ('ac5d1dd2f06f92e56f9d75d2090fd3d0', 'a36f64ba8c03f782c8fe552e92be8614') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_create_character(integer)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_state_of(uuid,integer)'));
  -- POST-MODERATION ONLY (Security ordering ruling 2026-10-11): the body
  -- 2026-10-11-name-moderation.sql leaves, with `must_rename` projected. The
  -- pre-moderation body (888304fc…) is refused on purpose: restating over it
  -- would ship a projection that moderation's later anchor could not find.
  if v_md5 is null or v_md5 not in ('9a8d651827010eba5ddc25b0012f9ff0', '7e38c7f1632b1124665ff3e5a561b9a3') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_state_of(uuid,integer)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_day_budget_used(uuid,integer,timestamp with time zone)'));
  if v_md5 is null or v_md5 not in ('39619e140d847d5df895dc4810bfa650', 'd59854a9d27baf52fdfbbbaf04b44602') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_day_budget_used(uuid,integer,timestamp with time zone)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'));
  if v_md5 is null or v_md5 not in ('eb2aca03e9817420e9d586924e133f69', 'f7b13d32d90c5c1b436ca6606d3fe4ac') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', v_md5;
  end if;
  v_md5 := (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.hr_ledger_prune(integer)'));
  if v_md5 is null or v_md5 not in ('a7e5085d34b8e4faa914c2724dff0fb9', '373aa1f22cca7ded4825c9f9f20db974') then
    raise exception 'account-wallet §0: % is absent or not the body this file restates (md5 %) — another lane moved it; restate from that body instead', 'public.hr_ledger_prune(integer)', v_md5;
  end if;
end $$;

-- ── §1 THE WALLET AND THE ONCE-PER-ACCOUNT GRANT KEYS ──────────────────────
create table if not exists public.account_wallet (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  gems          bigint      not null default 0 check (gems >= 0),
  hearth_tokens bigint      not null default 0 check (hearth_tokens >= 0),
  version       bigint      not null default 0,
  updated_at    timestamptz not null default now()
);
create table if not exists public.account_gem_grants (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  grant_key  text        not null check (length(grant_key) between 1 and 160),
  slot       integer     not null check (slot between 0 and 5),
  gems       bigint      not null check (gems > 0),
  at         timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, grant_key)
);
alter table public.account_wallet     enable row level security;
alter table public.account_wallet     force  row level security;
alter table public.account_gem_grants enable row level security;
alter table public.account_gem_grants force  row level security;

do $$
declare r text; t text;
begin
  foreach t in array array['public.account_wallet', 'public.account_gem_grants'] loop
    execute format('revoke all on %s from public', t);
    foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on %s from %I', t, r);
      end if;
    end loop;
  end loop;
end $$;

-- ── §2 player_ledger.kind ADMITS 'wallet' — PROGRAMMATIC, ADDITIVE ─────────
do $$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if position('''wallet''' in v_def) > 0 then
    raise notice 'player_ledger.kind already admits ''wallet'' — widen skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, '''accrue''::text', ''))) <> length('''accrue''::text') then
    raise exception 'player_ledger_kind_check has no single ''accrue''::text anchor (%) — refusing to widen blind', v_def;
  end if;
  v_new := replace(v_def, '''accrue''::text', '''wallet''::text, ''accrue''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
end $$;
-- The account-wide gem day cap reads gem INFLOWS of one account across every
-- slot; this keeps that read an index range on a tiny partial index.
create index if not exists player_ledger_gems_in_idx
  on public.player_ledger (user_id, at desc) where gems_in > 0;

-- ── §3 THE CHOKE POINT ─────────────────────────────────────────────────────
create or replace function public.hr_wallet_ensure(p_uid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.account_wallet (user_id) values (p_uid) on conflict (user_id) do nothing;
$$;

-- THE ONLY GEM CREDIT. Once per ACCOUNT per grant key; the account's day cap;
-- one kind='wallet' journal row. Raises (never returns) on a caller bug and on
-- the cap, so the caller's whole transaction — its once-guard, its gold, its
-- items — rolls back with it: a capped claim is not half-paid.
create or replace function public.hr_wallet_credit(
  p_uid uuid, p_slot integer, p_gems bigint, p_key text, p_expires_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w    public.account_wallet%rowtype;
  v_lim  bigint;
  v_used bigint;
  v_rows int;
begin
  if p_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then
    raise exception 'hr_wallet_credit: bad account/slot (%/%)', p_uid, p_slot;
  end if;
  if p_gems is null or p_gems <= 0 then
    raise exception 'hr_wallet_credit: a credit must be positive (%)', p_gems;
  end if;
  if p_key is null or length(btrim(p_key)) = 0 or length(p_key) > 160 then
    raise exception 'hr_wallet_credit: every gem credit needs an account grant key';
  end if;

  -- THE LEAF LOCK. Everything below — the key, the cap, the balance — is read
  -- and written under it.
  insert into public.account_wallet (user_id) values (p_uid) on conflict (user_id) do nothing;
  select * into v_w from public.account_wallet where user_id = p_uid for update;

  -- Periodic keys outlive their period by a margin and are then dead weight;
  -- the account's own next credit clears them (bounded, PK-prefix delete).
  delete from public.account_gem_grants
   where user_id = p_uid and expires_at is not null and expires_at < now();

  if exists (select 1 from public.account_gem_grants where user_id = p_uid and grant_key = p_key) then
    return jsonb_build_object('ok', true, 'paid', 0, 'already', true,
                              'balance', v_w.gems, 'version', v_w.version);
  end if;

  -- THE ACCOUNT'S DAY CAP, from the ONE budget source hr_apply's own check reads
  -- (hr_day_budget_used's gem dimension is summed over every slot of the
  -- account, §4), so the two can never disagree about what today has paid.
  v_lim  := (public.hr_day_budget_limits() ->> 'gems')::bigint;
  v_used := (public.hr_day_budget_used(p_uid, p_slot, now()) ->> 'gems')::bigint;
  if v_lim is null or v_used is null or v_used + p_gems > v_lim then
    perform public.hr_reject('daily_budget', jsonb_build_object(
      'dim', 'gems', 'scope', 'account', 'used', v_used, 'add', p_gems, 'limit', v_lim,
      'day', public.hr_utc_day_key(now())));
  end if;

  insert into public.account_gem_grants (user_id, grant_key, slot, gems, expires_at)
  values (p_uid, p_key, p_slot, p_gems, p_expires_at)
  on conflict (user_id, grant_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'hr_wallet_credit: grant key % appeared under the wallet lock', p_key;
  end if;

  update public.account_wallet
     set gems = gems + p_gems, version = version + 1, updated_at = now()
   where user_id = p_uid
  returning * into v_w;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (p_uid, p_slot, 'wallet', p_key, 0, 0, 0, 0, p_gems,
     jsonb_build_object('gems', p_gems, 'balance', v_w.gems,
                        'wallet_version', v_w.version, 'key', p_key));

  return jsonb_build_object('ok', true, 'paid', p_gems, 'balance', v_w.gems, 'version', v_w.version);
end $$;

-- THE ONLY GEM DEBIT. Refuses insufficient_gems WITHOUT writing anything, so
-- the caller can return its refusal cleanly; one kind='wallet' row on success.
create or replace function public.hr_wallet_debit(
  p_uid uuid, p_slot integer, p_gems bigint, p_intent text, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w public.account_wallet%rowtype;
begin
  if p_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then
    raise exception 'hr_wallet_debit: bad account/slot (%/%)', p_uid, p_slot;
  end if;
  if p_gems is null or p_gems <= 0 then
    raise exception 'hr_wallet_debit: a debit must be positive (%)', p_gems;
  end if;
  if p_intent is null or length(btrim(p_intent)) = 0 then
    raise exception 'hr_wallet_debit: every gem debit names its intent';
  end if;

  insert into public.account_wallet (user_id) values (p_uid) on conflict (user_id) do nothing;
  select * into v_w from public.account_wallet where user_id = p_uid for update;
  if v_w.gems < p_gems then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gems',
                              'have', v_w.gems, 'need', p_gems);
  end if;

  update public.account_wallet
     set gems = gems - p_gems, version = version + 1, updated_at = now()
   where user_id = p_uid
  returning * into v_w;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (p_uid, p_slot, 'wallet', p_intent, 0, 0, 0, 0, 0,
     coalesce(p_meta, '{}'::jsonb)
       || jsonb_build_object('gems', -p_gems, 'balance', v_w.gems, 'wallet_version', v_w.version));

  return jsonb_build_object('ok', true, 'balance', v_w.gems, 'version', v_w.version);
end $$;

-- ── §3b THE CHOKE POINT IS OWNER-ONLY — REVOKED AT CREATION ──────────────
-- A new function is executable by PUBLIC until this runs (so it runs here,
-- before anything else); nothing grants it to
-- any other role, so after it only the owner (and the definer RPCs that call
-- it as the owner) can. §8 k1 asserts that on the ACL itself.
revoke execute on function public.hr_wallet_ensure(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.hr_wallet_credit(uuid, integer, bigint, text, timestamp with time zone)
  from public, anon, authenticated, service_role;
revoke execute on function public.hr_wallet_debit(uuid, integer, bigint, text, jsonb)
  from public, anon, authenticated, service_role;

-- ── §4 THE GEM BODIES, RESTATED WHOLE (pinned in §0) ───────────────────────
-- Each is the replayed pre-image with ONLY its gem lines changed: the debit or
-- credit goes through §3, the claim/purchase row echoes `gems_paid` (never
-- `gems`), and the envelope's balance is the wallet's.

-- ── hr_buy_hero_slot__ungated ──
create or replace function public.hr_buy_hero_slot__ungated(p_slot_id integer, p_slot integer, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  -- BLAST RADIUS, not balance. Four slots exist and each is once-per-ACCOUNT
  -- forever, so this ceiling is structurally unreachable and says so out loud.
  -- It is here because the clamp is the house pattern (clan_deposit,
  -- hr_unlock_buy, hr_trait_buy) and because the day a sixth slot lands nobody
  -- will re-derive it: an account acquiring five hero slots in one day is not
  -- play, whatever the catalogue grows to.
  c_max_slots_per_day constant int := 5;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_cat    public.hr_hero_slots%rowtype;
  v_st     public.player_state%rowtype;
  v_owned  jsonb;
  v_cached jsonb;
  v_have   bigint;
  v_today  int;
  v_intent text;
  v_result jsonb;
  v_wallet jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- SHAPE FIRST, and for BOTH integers. p_slot names which of the caller's own
  -- characters pays; p_slot_id names which hero slot is bought. They are
  -- different numbers with different ranges and a transposed call must be
  -- refused rather than mis-charged.
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;
  if p_slot_id is null or p_slot_id < 0 or p_slot_id > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot_id', p_slot_id);
  end if;

  -- ── (1) THE CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row, so a client looping
  --        on a bad id cannot contend on a real player's state row. Slot 0 (free,
  --        uncatalogued) and slot 5 (past the hard cap) both land here.
  select * into v_cat from public.hr_hero_slots where slot_id = p_slot_id;
  if v_cat.slot_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'unknown_slot',
      jsonb_build_object('slot_id', p_slot_id), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_slot', 'slot_id', p_slot_id);
  end if;
  v_intent := 'hero_slot_buy:' || v_cat.slot_id;

  -- ── (2) SERIALISE. TWO LOCKS, CANONICAL ORDER, AND THE FIRST ONE IS THE
  --        ACCOUNT. The entitlement row lives on slot 0 while the money lives on
  --        the calling character, so a per-character lock alone would let two of
  --        one account's characters buy the same hero slot simultaneously and
  --        both charge. The slot-0 key is byte-identical to the key hr_apply
  --        takes for slot 0 (`uid || ':' || slot`), so this also serialises
  --        against an accrual touching the account's progress rows.
  --        Transaction-scoped (safe under the transaction pooler) and re-entrant.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || '0', 0));
  if v_slot <> 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
  end if;

  -- ── (3) IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY. player_intents
  --        is ONE namespace for every verb in this database, so a key claimed by
  --        another intent (or the same intent on another character) must be
  --        REFUSED, not answered with that intent's decision. Read INSIDE the
  --        lock so two simultaneous retries of one gesture cannot both miss the
  --        cache. ONLY SUCCESSES ARE CACHED (see (10)), so "you are 40 gems
  --        short" stays retryable the moment the gems arrive.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;

  -- ── (4) THE CALLING CHARACTER'S ROW, LOCKED. Not the wallet any more
  --        (2026-10-19-account-wallet.sql): gems are ONE balance per account in
  --        public.account_wallet. This row is locked because this character's
  --        version moves with the purchase, and because the house lock order is
  --        account advisory -> character advisory -> character row -> WALLET ROW.
  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (5) THE ACCOUNT'S CANONICAL ROW MUST EXIST. player_progress has an FK
  --        onto player_state(user_id, slot), so the slot-0 flag row this verb
  --        writes needs a slot-0 character. Every account has one by
  --        construction — but a 23503 raised after the debit would be a 500 the
  --        client cannot tell from an outage, and a refusal that cannot be told
  --        from an outage is not a refusal (the companion-grant lesson).
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = 0) then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;

  -- ── (6) OWNERSHIP, FROM THE ONE PREDICATE. `already_owned` covers a bought
  --        flag, a grandfathered character AND a premium waiver — which is why
  --        this function has no free path: a waived slot is refused as owned
  --        rather than granted for zero gems.
  v_owned := public.hr_hero_slots_of(v_uid);
  if v_owned @> to_jsonb(v_cat.slot_id) then
    return jsonb_build_object('ok', false, 'error', 'already_owned',
      'slot_id', v_cat.slot_id, 'hero_slots', v_owned);
  end if;

  -- ── (7) THE LADDER. Slot N requires N-1, checked against the SERVER's owned
  --        set. This is what stops the 1,500-gem slot being bought without the
  --        200 + 500 + 900 beneath it, and it is the reason a forged slot_id
  --        buys nothing: the price of slot 4 is the whole ladder.
  if not (v_owned @> to_jsonb(v_cat.slot_id - 1)) then
    return jsonb_build_object('ok', false, 'error', 'requires_previous_slot',
      'slot_id', v_cat.slot_id, 'requires', v_cat.slot_id - 1, 'hero_slots', v_owned);
  end if;

  -- ── (8) THE PER-DAY CLAMP, read from the APPEND-ONLY LEDGER rather than from
  --        a counter this function maintains (the clan_deposit pattern — a
  --        counter is a second source of truth that can be reset). ACCOUNT-WIDE
  --        (no slot filter), because the thing being bought is account-level.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and kind = 'hero_slot'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_slots_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'hero_slot_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_slots_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'hero_slot_daily_cap',
      'used', v_today, 'limit', c_max_slots_per_day);
  end if;

  -- ── (9) THE DEBIT, FROM THE ACCOUNT WALLET. The price is the server's OWN
  --        catalogue; nothing here is a number the caller supplied. hr_wallet_debit
  --        locks the wallet row (the LEAF lock), refuses insufficient_gems WITHOUT
  --        writing anything, and on success journals the signed movement as ONE
  --        kind='wallet' ledger row. Check and debit are one statement apart under
  --        that lock, so the balance cannot go negative.
  v_wallet := public.hr_wallet_debit(v_uid, v_slot, v_cat.cost_gems, v_intent,
                jsonb_build_object('slot_id', v_cat.slot_id, 'idem', p_idem));
  if coalesce(v_wallet->>'ok', 'false') <> 'true' then
    v_have := coalesce((v_wallet->>'have')::bigint, 0);
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'insufficient_gems',
      jsonb_build_object('slot_id', v_cat.slot_id, 'cost', v_cat.cost_gems, 'have', v_have), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_gems',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gems, 'have', v_have,
      'short_by', v_cat.cost_gems - v_have);
  end if;
  update public.player_state
     set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  -- ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so the
  --   unpaid accrual window survives it; stamping it here would confiscate every
  --   buyer's elapsed time, silently.

  -- ── (10) THE GRANT, ON THE ACCOUNT'S ROW. slot 0, kind='flag', period_key=''
  --         — the shape hr_unlocks catalogues and player_progress_unlock_guard
  --         independently polices. `greatest` is written out even though (6)
  --         already refuses a re-buy: (6) is the PURCHASE decision, this is the
  --         STORAGE rule.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, 0, 'flag', 'character_slot:' || v_cat.slot_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- ── (11) THE JOURNAL. ONE row per purchase. gold/gold_in/xp_in/qty_in/gems_in
  --         are ZERO and written explicitly: this transaction MINTED nothing,
  --         which is a different fact from "unstamped". The SIGNED gem movement is
  --         NOT here: it is the kind='wallet' row hr_wallet_debit wrote, and only
  --         wallet rows carry meta.gems, so the account's gems are summed from one
  --         kind and can never be counted twice. This row is the PURCHASE.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'hero_slot', v_intent,
     0, 0, 0, 0, 0,
     jsonb_build_object('slot_id', v_cat.slot_id, 'name', v_cat.name,
                        'currency', 'gems', 'cost', v_cat.cost_gems,
                        'charged_slot', v_slot, 'idem', p_idem));

  -- ── (12) THE ENVELOPE. The balance is the WALLET's, as hr_wallet_debit
  --         returned it under the wallet lock, and `hero_slots` is the
  --         account's WHOLE owned set so one answer hydrates the client rather
  --         than one delta.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'slot_id', v_cat.slot_id, 'name', v_cat.name,
    'currency', 'gems', 'cost', v_cat.cost_gems,
    'gems', (v_wallet->>'balance')::bigint, 'version', v_st.version, 'slot', v_slot,
    'hero_slots', public.hr_hero_slots_of(v_uid));

  -- ⚠ SUCCESSES ONLY. A cached refusal would make "not enough gems" permanent
  --   for that key; the client generates a fresh key per gesture, so a genuine
  --   retry of the SAME gesture still replays this envelope and debits nothing.
  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, v_intent, v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;

  return v_result;
end $$;
revoke execute on function public.hr_buy_hero_slot__ungated(integer, integer, uuid)
  from public, anon, authenticated, service_role;

-- ── hr_buy_gem_unlock__ungated ──
create or replace function public.hr_buy_gem_unlock__ungated(p_unlock_id text, p_slot integer, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  -- BLAST RADIUS, not balance. The catalogue holds nine priced rows and each is
  -- once-per-character forever, so a character buying twelve in a day is not
  -- play whatever the catalogue grows to. Read from the APPEND-ONLY LEDGER, not
  -- from a counter this function maintains — a counter is a second source of
  -- truth that can be reset (the clan_deposit pattern).
  c_max_per_day constant int := 12;
  -- Shape bound on the wire argument, checked BEFORE any table is touched, so a
  -- client looping on a megabyte string cannot make the database hash it.
  c_max_id_len  constant int := 64;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_cat    public.hr_gem_unlocks%rowtype;
  v_st     public.player_state%rowtype;
  v_owned  jsonb;
  v_cached jsonb;
  v_have   bigint;
  v_today  int;
  v_intent text;
  v_result jsonb;
  v_wallet jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;
  if p_unlock_id is null or length(p_unlock_id) = 0 or length(p_unlock_id) > c_max_id_len then
    return jsonb_build_object('ok', false, 'error', 'bad_unlock_id');
  end if;

  -- ── (1) THE CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row, so a client looping
  --        on a bad id cannot contend on a real player's state row.
  select * into v_cat from public.hr_gem_unlocks where unlock_id = p_unlock_id;
  if v_cat.unlock_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'gem_unlock_buy', 'unknown_unlock',
      jsonb_build_object('unlock_id', p_unlock_id), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_unlock', 'unlock_id', p_unlock_id);
  end if;

  -- ── (2) A FREE ROW IS NOT FOR SALE. There is no zero-gem purchase path in
  --        this function AT ALL — the refusal is here, above the lock, rather
  --        than as a `if cost > 0 then debit` branch further down, because a
  --        branch that skips a debit is one edit away from being a faucet.
  if v_cat.free then
    perform public.hr_record_rejection(v_uid, v_slot, 'gem_unlock_buy', 'not_for_sale',
      jsonb_build_object('unlock_id', v_cat.unlock_id), 1);
    return jsonb_build_object('ok', false, 'error', 'not_for_sale',
      'unlock_id', v_cat.unlock_id, 'gem_unlocks', public.hr_gem_unlocks_of(v_uid, v_slot));
  end if;
  v_intent := 'gem_unlock_buy:' || v_cat.unlock_id;

  -- ── (3) SERIALISE. ONE lock, the calling character's, because BOTH the money
  --        and the entitlement live on that row (see the scope decision in the
  --        header). The key is byte-identical to the one hr_apply takes, so this
  --        also serialises against an accrual settling the same character.
  --        Transaction-scoped (safe under the transaction pooler), re-entrant.
  -- THE ACCOUNT LOCK FIRST (Security C1, 2026-10-11). Ownership is account-wide
  -- (hr_gem_unlocks_of) and so is the wallet, so two heroes of one account
  -- buying the same unlock must serialise on the ACCOUNT, or both read "not
  -- owned" and both debit. House order, as hr_buy_hero_slot: uid:0 -> uid:slot.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || '0', 0));
  if v_slot <> 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
  end if;

  -- ── (4) IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY. player_intents is
  --        ONE namespace for every verb in this database, so a key claimed by
  --        another intent must be REFUSED rather than answered with that
  --        intent's decision. Read INSIDE the lock so two simultaneous retries of
  --        one gesture cannot both miss the cache. ONLY SUCCESSES ARE CACHED
  --        (see (9)), so "you are 40 gems short" stays retryable.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;

  -- ── (5) THE CHARGED ROW, LOCKED. This is the wallet the topbar is showing.
  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (6) OWNERSHIP, FROM THE ONE PREDICATE, ACCOUNT-WIDE. Refused BEFORE the
  --        debit, which is the bug src/legacy.js buyTheme found on its own client
  --        side: the debit used to run unconditionally, so buying a theme you
  --        already owned charged you again and the only thing between the player
  --        and a second 1,000-gem Volcanic Keep was a button label.
  --        ⚠ THIS READ IS ACCOUNT-SCOPED BY THE 2026-09-14 RULING, and that is
  --          what stops Hero 2 paying 1,200 gems for a Phoenix Pet the account
  --          owns. A slot-scoped read here would be a silent double charge on
  --          the premium currency for every multi-character player.
  v_owned := public.hr_gem_unlocks_of(v_uid, v_slot);
  if v_owned @> to_jsonb(v_cat.unlock_id) then
    return jsonb_build_object('ok', false, 'error', 'already_owned',
      'unlock_id', v_cat.unlock_id, 'gem_unlocks', v_owned);
  end if;

  -- ── (7) THE PER-DAY CLAMP, from the append-only ledger, on the SERVER clock.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and kind = 'gem_unlock'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'gem_unlock_buy', 'gem_unlock_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'gem_unlock_daily_cap',
      'used', v_today, 'limit', c_max_per_day);
  end if;

  -- ── (8) THE DEBIT AND THE GRANT, one transaction, under the lock. Every
  --        number here is read from the server's own catalogue or the server's
  --        own row; nothing on the wire priced anything. The balance cannot go
  --        negative — the check and the update are one statement apart inside a
  --        transaction holding the row lock.
  -- ACCOUNT WALLET (2026-10-19-account-wallet.sql): the debit is the account's,
  -- under the wallet row lock (the LEAF lock), refused WITHOUT a write when short,
  -- journalled as ONE kind='wallet' ledger row when it lands.
  v_wallet := public.hr_wallet_debit(v_uid, v_slot, v_cat.cost_gems, v_intent,
                jsonb_build_object('unlock_id', v_cat.unlock_id, 'idem', p_idem));
  if coalesce(v_wallet->>'ok', 'false') <> 'true' then
    v_have := coalesce((v_wallet->>'have')::bigint, 0);
    perform public.hr_record_rejection(v_uid, v_slot, 'gem_unlock_buy', 'insufficient_gems',
      jsonb_build_object('unlock_id', v_cat.unlock_id, 'cost', v_cat.cost_gems, 'have', v_have), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_gems',
      'unlock_id', v_cat.unlock_id, 'cost', v_cat.cost_gems, 'have', v_have,
      'short_by', v_cat.cost_gems - v_have);
  end if;
  update public.player_state
     set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  -- ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so the
  --   unpaid accrual window survives it; stamping it here would confiscate every
  --   buyer's elapsed time, silently.

  -- kind='flag', period_key='' — the shape hr_unlocks catalogues and
  -- player_progress_unlock_guard independently polices. `greatest` is written out
  -- even though (6) already refuses a re-buy: (6) is the PURCHASE decision, this
  -- is the STORAGE rule, and the two must not depend on each other.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'flag', v_cat.unlock_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- ── (9) THE JOURNAL. ONE row per purchase. gold/gold_in/xp_in/qty_in/gems_in
  --        are ZERO and written explicitly: this transaction MINTED nothing,
  --        which is a different fact from "unstamped". player_ledger has no
  --        SIGNED gems column, so the signed movement rides meta.gems — where
  --        hr_buy_hero_slot and hr_trait_buy put theirs.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'gem_unlock', v_intent,
     0, 0, 0, 0, 0,
     jsonb_build_object('unlock_id', v_cat.unlock_id, 'offer_id', v_cat.offer_id,
                        'name', v_cat.name, 'currency', 'gems', 'cost', v_cat.cost_gems,
                        'idem', p_idem));

  -- ── (10) THE ENVELOPE. The balance is RE-READ from the row rather than
  --         arithmetic on a pre-update snapshot, and `gem_unlocks` is the
  --         character's WHOLE owned set so one answer hydrates the client rather
  --         than one delta it has to merge upward (CLAUDE.md §6, 2026-09-14).
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'unlock_id', v_cat.unlock_id, 'offer_id', v_cat.offer_id,
    'name', v_cat.name, 'currency', 'gems', 'cost', v_cat.cost_gems,
    'gems', (v_wallet->>'balance')::bigint, 'version', v_st.version, 'slot', v_slot,
    'gem_unlocks', public.hr_gem_unlocks_of(v_uid, v_slot));

  -- ⚠ SUCCESSES ONLY. A cached refusal would make "not enough gems" permanent for
  --   that key; the client generates a fresh key per gesture, so a genuine retry
  --   of the SAME gesture replays this envelope and debits nothing.
  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, v_intent, v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;

  return v_result;
end $$;
revoke execute on function public.hr_buy_gem_unlock__ungated(text, integer, uuid)
  from public, anon, authenticated, service_role;

-- ── hr_claim_goal__ungated ──
create or replace function public.hr_claim_goal__ungated(p_goal_id text, p_weekly boolean, p_slot integer, p_idem uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_cat    public.hr_goal_rewards%rowtype;
  v_state  public.player_state%rowtype;
  v_cached jsonb;
  v_period text;
  v_have   bigint := 0;
  v_rows   int;
  v_days   text[];
  v_xp_ok    jsonb := '{}'::jsonb;
  v_xp_skip  jsonb := '{}'::jsonb;
  v_it_ok    jsonb := '{}'::jsonb;
  v_it_skip  jsonb := '{}'::jsonb;
  v_k text; v_v text; v_n bigint;
  v_result jsonb;
  v_gems   bigint := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'not_signed_in');
  end if;

  -- IDEMPOTENCY: a retry replays the original envelope verbatim. Read first,
  -- before anything that could change state or consume rate budget.
  if p_idem is not null then
    -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
    -- player_intents is ONE namespace for every verb in this database, so a key
    -- claimed by another intent (or the same intent on another slot) must be
    -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
    -- has carried since apply-engine §S6; the helper is the one copy of the rule.
    -- A NULL answer means "no cached decision" and the body proceeds as before.
    select public.hr_intent_replay(v_uid, v_slot, p_idem, 'goal_claim') into v_cached;
    if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
    if v_cached is not null then return v_cached; end if;
  end if;

  -- THE SERVER CATALOGUE. An id it does not carry is refused, never paid.
  select * into v_cat from public.hr_goal_rewards where goal_id = p_goal_id;
  if v_cat.goal_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'goal_claim', 'unknown_goal',
      jsonb_build_object('goal', p_goal_id), 1);
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'unknown_goal',
      'goal', p_goal_id);
  end if;
  -- The CATALOGUE decides which pool a goal is in. p_weekly is a cross-check:
  -- a disagreement means the client and the server hold different ideas of what
  -- this goal is, which is worth surfacing rather than quietly resolving.
  if p_weekly is not null and p_weekly is distinct from v_cat.weekly then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'wrong_period',
      'goal', p_goal_id, 'weekly', v_cat.weekly);
  end if;

  -- The character must be one of the caller's own, and locking it here
  -- serialises every concurrent claim for this character behind one row.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_state.user_id is null then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'no_character',
      'slot', v_slot);
  end if;

  v_period := case when v_cat.weekly then public.hr_iso_week_key(now())
                   else public.hr_utc_day_key(now()) end;
  if coalesce(v_period, '') = '' then
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'no_period_key');
  end if;

  -- ── VERIFY COMPLETION FROM THE SERVER'S OWN NUMBERS ────────────────────
  if v_cat.counter_kind = 'ledger_gold' then
    select coalesce(sum(gold), 0) into v_have
      from public.player_ledger
     where user_id = v_uid and slot = v_slot
       and gold > 0
       and at >= public.hr_goal_period_start(v_cat.weekly, now());
  elsif v_cat.weekly then
    v_days := public.hr_goal_week_days(now());
    select coalesce(sum(value), 0) into v_have
      from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = 'daily' and key = v_cat.counter_key
       and period_key = any (v_days);
  else
    select coalesce(value, 0) into v_have
      from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = 'daily' and key = v_cat.counter_key
       and period_key = v_period;
  end if;
  v_have := coalesce(v_have, 0);
  if v_have < v_cat.target then
    perform public.hr_record_rejection(v_uid, v_slot, 'goal_claim', 'not_complete',
      jsonb_build_object('goal', p_goal_id, 'have', v_have, 'target', v_cat.target), 1);
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'not_complete',
      'goal', p_goal_id, 'have', v_have, 'target', v_cat.target, 'period', v_period);
  end if;

  -- ── PLAN THE MINT (pure reads, BEFORE the consume) ─────────────────────
  -- An id the server catalogue does not know is skipped and REPORTED, never
  -- minted and never fatal: a cosmetic id must not cost a player their claim.
  for v_k, v_v in select key, value from jsonb_each_text(v_cat.xp) loop
    v_n := floor(coalesce(v_v::numeric, 0))::bigint;
    if v_n > 0 and exists (select 1 from public.hr_skills where skill_id = v_k) then
      v_xp_ok := v_xp_ok || jsonb_build_object(v_k, v_n);
    elsif v_n > 0 then
      v_xp_skip := v_xp_skip || jsonb_build_object(v_k, v_n);
    end if;
  end loop;
  for v_k, v_v in select key, value from jsonb_each_text(v_cat.items) loop
    v_n := floor(coalesce(v_v::numeric, 0))::bigint;
    if v_n > 0 and exists (select 1 from public.hr_items where item_id = v_k) then
      v_it_ok := v_it_ok || jsonb_build_object(v_k, v_n);
    elsif v_n > 0 then
      v_it_skip := v_it_skip || jsonb_build_object(v_k, v_n);
    end if;
  end loop;

  -- NOTHING TO PAY → refuse BEFORE the consume, so the claim stays claimable
  -- once the authored id is fixed. Burning a once-per-period claim on an empty
  -- reward is the same defect as the dead button this file exists to remove.
  if v_cat.gold = 0 and v_cat.gems = 0 and v_xp_ok = '{}'::jsonb and v_it_ok = '{}'::jsonb then
    perform public.hr_record_rejection(v_uid, v_slot, 'goal_claim', 'reward_unavailable',
      jsonb_build_object('goal', p_goal_id, 'skipped_xp', v_xp_skip, 'skipped_items', v_it_skip), 1);
    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'reward_unavailable',
      'goal', p_goal_id, 'skipped_xp', v_xp_skip, 'skipped_items', v_it_skip);
  end if;

  -- ── CONSUME (once-guard). A replay is refused BEFORE any credit. ───────
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'quest', 'goal:' || v_cat.goal_id, 1, v_period, 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'outcome', 'already_claimed', 'error', 'already_claimed',
      'goal', p_goal_id, 'period', v_period);
  end if;

  -- ── CREDIT — every half of the reward, one transaction ─────────────────
  update public.player_state
     set gold = coalesce(gold, 0) + v_cat.gold,
         version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  -- GEMS -> THE ACCOUNT WALLET, ONCE PER ACCOUNT (2026-10-19-account-wallet.sql).
  --   The grant key 'goal:<id>:<period>' is the account's, not this character's: a second
  --   character claiming the same reward is paid its gold and NO gems (paid 0).
  --   v_gems becomes what the wallet actually paid, so the journal and the
  --   receipt below can never claim gems that did not land.
  if v_cat.gems > 0 then
    v_gems := (public.hr_wallet_credit(v_uid, v_slot, v_cat.gems,
                 'goal:' || v_cat.goal_id || ':' || v_period,
                 now() + case when v_cat.weekly then interval '15 days' else interval '2 days' end)
               ->> 'paid')::bigint;
  end if;

  for v_k, v_v in select key, value from jsonb_each_text(v_xp_ok) loop
    insert into public.player_skills as sk (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;
  end loop;

  for v_k, v_v in select key, value from jsonb_each_text(v_it_ok) loop
    insert into public.player_inventory as inv (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_k, v_v::bigint)
      on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  end loop;

  -- ONE journal row, never one per component. gold_in/xp_in/qty_in/gems_in are
  -- 0: a fixed, once-per-period, server-catalogued reward is kept OUT of the
  -- accrual inflow budget (the muster/raid-chest and b414 rule). The header
  -- states the structural ceiling that replaces it.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'daily', 'goal_claim:' || v_period || ':' || v_cat.goal_id,
     v_cat.gold, 0, 0, 0, 0,
     jsonb_build_object('goal', v_cat.goal_id, 'weekly', v_cat.weekly, 'period', v_period,
       'counter_kind', v_cat.counter_kind, 'counter_key', v_cat.counter_key,
       'target', v_cat.target, 'have', v_have,
       'gems_paid', v_gems, 'xp', v_xp_ok, 'items', v_it_ok,
       'skipped_xp', v_xp_skip, 'skipped_items', v_it_skip));

  v_result := jsonb_build_object('ok', true, 'outcome', 'applied', 'credited', true,
    'goal', v_cat.goal_id, 'weekly', v_cat.weekly, 'period', v_period, 'slot', v_slot,
    'have', v_have, 'target', v_cat.target,
    'gold', v_cat.gold, 'gems', v_gems, 'xp', v_xp_ok, 'items', v_it_ok,
    'skipped_xp', v_xp_skip, 'skipped_items', v_it_skip);

  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, 'goal_claim', v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;
  return v_result;
end $$;
revoke execute on function public.hr_claim_goal__ungated(text, boolean, integer, uuid)
  from public, anon, authenticated, service_role;

-- ── hr_claim_milestone__ungated ──
create or replace function public.hr_claim_milestone__ungated(p_milestone_id text, p_slot integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_slot   int := coalesce(p_slot, 0);
  v_domain text;
  v_thresh bigint;
  v_gold   bigint;
  v_gems   int;
  v_have   bigint;
  v_rows   int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- Credit target must be one of the caller's own characters (before any consume).
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/collection-milestones.js).
  -- hunterAll's threshold is the monster-catalogue size (drift-guarded).
  case p_milestone_id
    when 'hunter10'   then v_domain := 'monsters'; v_thresh := 10;  v_gold := 2000;  v_gems := 0;
    when 'hunter25'   then v_domain := 'monsters'; v_thresh := 25;  v_gold := 4000;  v_gems := 0;
    when 'hunter40'   then v_domain := 'monsters'; v_thresh := 40;  v_gold := 8000;  v_gems := 0;
    when 'hunter60'   then v_domain := 'monsters'; v_thresh := 60;  v_gold := 15000; v_gems := 0;
    when 'hunter85'   then v_domain := 'monsters'; v_thresh := 85;  v_gold := 25000; v_gems := 0;
    when 'hunterAll'  then v_domain := 'monsters'; v_thresh := 108; v_gold := 50000; v_gems := 25;
    when 'collect25'  then v_domain := 'items';    v_thresh := 25;  v_gold := 1000;  v_gems := 0;
    when 'collect50'  then v_domain := 'items';    v_thresh := 50;  v_gold := 5000;  v_gems := 0;
    when 'collect75'  then v_domain := 'items';    v_thresh := 75;  v_gold := 10000; v_gems := 0;
    when 'collect100' then v_domain := 'items';    v_thresh := 100; v_gold := 15000; v_gems := 15;
    when 'collect125' then v_domain := 'items';    v_thresh := 125; v_gold := 30000; v_gems := 0;
    else return jsonb_build_object('ok', false, 'error', 'unknown_milestone', 'milestone', p_milestone_id);
  end case;

  -- VERIFY completion from the server's OWN per-entry projection (DISTINCT count).
  if v_domain = 'monsters' then
    select count(*) into v_have from public.hr_bestiary_of(auth.uid(), v_slot);
  else
    select count(*) into v_have from public.hr_collection_of(auth.uid(), v_slot);
  end if;
  if coalesce(v_have, 0) < v_thresh then
    return jsonb_build_object('ok', false, 'error', 'incomplete',
      'milestone', p_milestone_id, 'have', coalesce(v_have, 0), 'goal', v_thresh, 'domain', v_domain);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'collection', p_milestone_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'milestone', p_milestone_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume).
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  -- GEMS -> THE ACCOUNT WALLET, ONCE PER ACCOUNT (2026-10-19-account-wallet.sql).
  --   The grant key 'milestone:<id>' is the account's, not this character's: a second
  --   character claiming the same reward is paid its gold and NO gems (paid 0).
  --   v_gems becomes what the wallet actually paid, so the journal and the
  --   receipt below can never claim gems that did not land.
  if v_gems > 0 then
    v_gems := (public.hr_wallet_credit(auth.uid(), v_slot, v_gems, 'milestone:' || p_milestone_id, null) ->> 'paid')::int;
  end if;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'collection', 'milestone_claim:' || p_milestone_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('milestone', p_milestone_id, 'domain', v_domain,
                        'goal', v_thresh, 'have', v_have, 'gems_paid', v_gems));

  return jsonb_build_object('ok', true, 'milestone', p_milestone_id, 'gold', v_gold,
    'gems', v_gems, 'slot', v_slot, 'credited', true);
end $$;
revoke execute on function public.hr_claim_milestone__ungated(text, integer)
  from public, anon, authenticated, service_role;

-- ── hr_claim_rank__ungated ──
create or replace function public.hr_claim_rank__ungated(p_rank_id text, p_slot integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_slot int := coalesce(p_slot, 0);
  v_min  bigint;
  v_gold bigint;
  v_gems int;
  v_live bigint;
  v_high bigint;
  v_rows int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- SERVER-OWNED CATALOGUE (kept in lockstep with src/data/renown-ranks.js).
  -- peasant (min 0, no reward) is intentionally absent → unknown_rank.
  case p_rank_id
    when 'serf'     then v_min := 400;    v_gold := 250;     v_gems := 0;
    when 'squire'   then v_min := 900;    v_gold := 750;     v_gems := 0;
    when 'knight'   then v_min := 2200;   v_gold := 2000;    v_gems := 0;
    when 'baron'    then v_min := 4500;   v_gold := 5000;    v_gems := 25;
    when 'viscount' then v_min := 8000;   v_gold := 10000;   v_gems := 0;
    when 'count'    then v_min := 13500;  v_gold := 20000;   v_gems := 50;
    when 'marquis'  then v_min := 21000;  v_gold := 40000;   v_gems := 0;
    when 'duke'     then v_min := 32000;  v_gold := 75000;   v_gems := 100;
    when 'prince'   then v_min := 48000;  v_gold := 150000;  v_gems := 0;
    when 'king'     then v_min := 72000;  v_gold := 300000;  v_gems := 250;
    when 'highking' then v_min := 120000; v_gold := 1000000; v_gems := 500;
    else return jsonb_build_object('ok', false, 'error', 'unknown_rank', 'rank', p_rank_id);
  end case;

  -- ── THE RATCHET. Read the SERVER-DERIVED live score, then advance the
  --    high-water in ONE atomic read-modify-write. `greatest` means a transient
  --    low live read can NEVER lower it. No version bump on the pure advance, so
  --    it does not manufacture a version_conflict against a concurrent accrue.
  v_live := public.hr_renown_of(auth.uid(), v_slot);
  update public.player_state
     set renown_high = greatest(coalesce(renown_high, 0), coalesce(v_live, 0))
   where user_id = auth.uid() and slot = v_slot
   returning renown_high into v_high;

  -- DECIDE against the high-water, never the raw live score.
  if coalesce(v_high, 0) < v_min then
    return jsonb_build_object('ok', false, 'error', 'not_reached',
      'rank', p_rank_id, 'renown_high', coalesce(v_high, 0), 'min', v_min);
  end if;

  -- CONSUME (once-guard). Replay → row_count 0 → refused before the credit.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (auth.uid(), v_slot, 'flag', 'renown_claim:' || p_rank_id, 1, '', 'claimed', now())
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'rank', p_rank_id);
  end if;

  -- CREDIT (after the guard → exactly once, same transaction as the consume).
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  -- GEMS -> THE ACCOUNT WALLET, ONCE PER ACCOUNT (2026-10-19-account-wallet.sql).
  --   The grant key 'rank:<id>' is the account's, not this character's: a second
  --   character claiming the same reward is paid its gold and NO gems (paid 0).
  --   v_gems becomes what the wallet actually paid, so the journal and the
  --   receipt below can never claim gems that did not land.
  if v_gems > 0 then
    v_gems := (public.hr_wallet_credit(auth.uid(), v_slot, v_gems, 'rank:' || p_rank_id, null) ->> 'paid')::int;
  end if;
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'renown', 'rank_claim:' || p_rank_id,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('rank', p_rank_id, 'min', v_min, 'renown_high', v_high, 'gems_paid', v_gems));

  return jsonb_build_object('ok', true, 'rank', p_rank_id, 'gold', v_gold, 'gems', v_gems,
    'renown_high', v_high, 'slot', v_slot, 'credited', true);
end $$;
revoke execute on function public.hr_claim_rank__ungated(text, integer)
  from public, anon, authenticated, service_role;

-- ── raid_claim__ungated ──
create or replace function public.raid_claim__ungated(p_scope text, p_clan_id uuid, p_week text, p_slot integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  c_grace interval := interval '24 hours';
  c_solo_gold constant bigint := 2800;   -- src/features/raids.js SOLO_CHEST.gold
  c_solo_gems constant int    := 5;      -- src/features/raids.js SOLO_CHEST.gems
  c_solo_scale constant numeric := 0.4;  -- src/features/raids.js SOLO_SCALE
  c_solo_mats  constant int := 2;        -- src/features/raids.js soloChestFor slice(0,2)
  v_week    text := public.hr_utc_week_key();
  v_target  text;
  v_slot    int := coalesce(p_slot, 0);
  v_raid    public.clan_raids%rowtype;
  v_t       public.hr_hunt_tiers%rowtype;
  v_boss    public.hr_hunt_bosses%rowtype;
  v_strikes int;
  v_damage  bigint;
  v_joined  timestamptz;
  v_members int;
  v_share   bigint;
  v_ratio   numeric;
  v_band    text;
  v_bandmul numeric;
  v_total   bigint;
  v_factor  numeric := 1;
  v_partial boolean := false;
  v_scale   numeric;
  v_sig     boolean := false;
  v_standing bigint := 0;
  v_paid    int;
  v_rows    int;
  v_has_standing boolean;
  v_gold    bigint := 0;
  v_gems    int    := 0;
  -- chest-item locals
  v_mats    text[];
  v_mid     text;
  v_nids    int;
  v_each    int;
  v_q       bigint;
  v_items   jsonb := '[]'::jsonb;
  v_qty_total bigint := 0;
  v_nboss   int;
  v_ord     int;
  v_i       int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_scope is null or p_scope not in ('clan','solo') then
    return jsonb_build_object('ok', false, 'error', 'bad_scope');
  end if;

  -- Credit target must be the caller's own character; refused before any consume.
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── R1 (2026-08-11): THE WEEK KEY IS DERIVED, NEVER ECHOED ───
  if p_week = v_week then
    v_target := v_week;
  elsif p_week ~ '^w[0-9]{1,7}$' then
    if public.hr_week_start(p_week) = public.hr_week_start(v_week) - interval '7 days'
       and now() < public.hr_week_start(v_week) + c_grace then
      v_target := 'w' || (substr(p_week, 2)::int)::text;
    else
      return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week);
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'week_mismatch', 'week', v_week);
  end if;

  if p_scope = 'solo' then
    insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)
    values (auth.uid(), v_target, 'solo', null, null, c_solo_scale)
    on conflict (user_id, week_key) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return jsonb_build_object('ok', false, 'error', 'already_claimed', 'week', v_target);
    end if;

    -- Solo chest: flat server constant × 0.4. Credited after the consume guard.
    v_gold := floor(c_solo_gold * c_solo_scale)::bigint;
    v_gems := floor(c_solo_gems * c_solo_scale)::int;
    update public.player_state
       set gold = coalesce(gold, 0) + v_gold,
           version = version + 1, updated_at = now()
     where user_id = auth.uid() and slot = v_slot;
    -- GEMS -> THE ACCOUNT WALLET, ONCE PER ACCOUNT PER WEEK (2026-10-19-account-wallet.sql).
    if v_gems > 0 then
      v_gems := (public.hr_wallet_credit(auth.uid(), v_slot, v_gems, 'raid:' || v_target,
                   now() + interval '15 days') ->> 'paid')::int;
    end if;

    -- ── SOLO CHEST MATERIALS. bossOfWeek reproduced with hr_fnv1a over the
    --    catalogue ordinal (byte-identical to the client's fnv1a rotation),
    --    then the first two of that boss's materials at qty 1 each. No signature.
    select count(*)::int into v_nboss from public.hr_hunt_boss_reward;
    if coalesce(v_nboss, 0) > 0 then
      v_ord := (public.hr_fnv1a('hr-raid-' || v_target) % v_nboss)::int;
      select material_ids into v_mats from public.hr_hunt_boss_reward where ordinal = v_ord;
      if v_mats is not null then
        v_nids := least(c_solo_mats, array_length(v_mats, 1));
        for v_i in 1 .. v_nids loop
          v_mid := v_mats[v_i];
          v_q   := 1;   -- floor(1 × 0.4) = 0, floored up to 1 (soloChestFor qty 1)
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (auth.uid(), v_slot, v_mid, v_q)
            on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
          v_items := v_items || jsonb_build_object('id', v_mid, 'qty', v_q);
          v_qty_total := v_qty_total + v_q;
        end loop;
      end if;
    end if;

    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (auth.uid(), v_slot, 'raid', 'raid_claim:solo:' || v_target,
       v_gold, 0, 0, 0, 0,
       jsonb_build_object('scope', 'solo', 'week', v_target, 'scale', c_solo_scale,
                          'gems_paid', v_gems, 'items', v_items, 'item_qty', v_qty_total));

    return jsonb_build_object('ok', true, 'scope', 'solo', 'week', v_target,
      'scale', c_solo_scale, 'tier', 0, 'band', 'solo', 'partial', false, 'sig', false,
      'gold', v_gold, 'gems', v_gems, 'slot', v_slot, 'credited', true,
      'items', v_items);
  end if;

  if p_clan_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_clan');
  end if;
  select * into v_raid from public.clan_raids where clan_id = p_clan_id and week_key = v_target;
  if v_raid.clan_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_downed');
  end if;

  v_partial := v_raid.downed_at is null;
  if v_partial and v_target = v_week then
    return jsonb_build_object('ok', false, 'error', 'not_downed');
  end if;

  select joined_at into v_joined from public.clan_members
    where clan_id = p_clan_id and user_id = auth.uid();
  if v_joined is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if v_raid.downed_at is not null and v_joined > v_raid.downed_at then
    return jsonb_build_object('ok', false, 'error', 'joined_after_kill');
  end if;
  if v_raid.declared_at is not null and v_joined >= v_raid.declared_at then
    return jsonb_build_object('ok', false, 'error', 'joined_after_declare');
  end if;

  select strikes, damage into v_strikes, v_damage from public.raid_contributions
    where clan_id = p_clan_id and week_key = v_target and user_id = auth.uid();

  if coalesce(v_damage, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if coalesce(v_strikes, 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'too_few_strikes', 'strikes', coalesce(v_strikes, 0));
  end if;

  v_members := greatest(1, coalesce(nullif(v_raid.members_at_declare, 0),
                 (select count(*)::int from public.clan_members where clan_id = p_clan_id), 1));
  v_share   := public.hr_hunt_share(v_raid.max_hp, v_members);
  v_ratio   := round(v_damage::numeric / v_share::numeric, 4);
  v_band    := public.hr_hunt_band(v_damage, v_share, v_partial);
  v_bandmul := public.hr_hunt_band_mul(v_band);
  if v_bandmul <= 0 then
    v_band := 'partisan'; v_bandmul := 0.6;
  end if;

  if v_partial then
    select coalesce(sum(damage), 0) into v_total from public.raid_contributions
      where clan_id = p_clan_id and week_key = v_target;
    v_factor := least(0.6, v_total::numeric / greatest(1, v_raid.max_hp)::numeric);
    if v_factor <= 0 then
      return jsonb_build_object('ok', false, 'error', 'no_contribution');
    end if;
  end if;
  v_scale := round(v_bandmul * v_factor, 4);

  select * into v_t from public.hr_hunt_tiers where tier = greatest(1, least(5, coalesce(v_raid.tier, 1)));
  select * into v_boss from public.hr_hunt_bosses where boss_id = v_raid.boss_id;

  if not v_partial and v_t.tier is not null and v_t.sig_chance > 0
     and (not v_t.sig_champion_only or v_band = 'champion') then
    v_sig := random() < v_t.sig_chance;
  end if;

  -- ── THE CONSUME. on-conflict-do-nothing; row_count = 0 is a replay.
  insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)
  values (auth.uid(), v_target, 'clan', p_clan_id, v_raid.boss_id, v_scale)
  on conflict (user_id, week_key) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed', 'week', v_target);
  end if;

  update public.raid_contributions set claimed = true, claimed_at = now()
    where clan_id = p_clan_id and week_key = v_target and user_id = auth.uid();

  -- ── THE GOLD/GEMS CREDIT (after the consume guard → exactly once). Base is the
  --    server-owned tier catalogue, scaled by the server-computed v_scale.
  v_gold := floor(coalesce(v_t.chest_gold, 0) * v_scale)::bigint;
  v_gems := floor(coalesce(v_t.chest_gems, 0) * v_scale)::int;
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold,
         version = version + 1, updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  -- GEMS -> THE ACCOUNT WALLET, ONCE PER ACCOUNT PER WEEK (2026-10-19-account-wallet.sql).
  -- 'raid:<week>' is shared with the solo chest on purpose: raid_claims is already
  -- one row per (account, week) across both scopes, and the key says so too.
  if v_gems > 0 then
    v_gems := (public.hr_wallet_credit(auth.uid(), v_slot, v_gems, 'raid:' || v_target,
                 now() + interval '15 days') ->> 'paid')::int;
  end if;

  -- ── THE CHEST MATERIALS + SIGNATURE. Written to player_inventory — the source
  --    of truth the accrual absolute envelope is built FROM, so a credited item
  --    survives the flip by construction. Materials from the boss reward catalogue
  --    (server-known ids), count = round(chest_mats / n) per material, scaled by
  --    v_scale exactly as chestFor + grantReward did. Same transaction / after the
  --    consume, so a replay never reaches here and a rollback undoes it.
  select material_ids into v_mats from public.hr_hunt_boss_reward where boss_id = v_raid.boss_id;
  if v_mats is not null then
    v_nids := greatest(1, array_length(v_mats, 1));
    v_each := greatest(1, round(coalesce(v_t.chest_mats, 0)::numeric / v_nids)::int);
    foreach v_mid in array v_mats loop
      v_q := greatest(1, floor(v_each * v_scale))::bigint;
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_slot, v_mid, v_q)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_items := v_items || jsonb_build_object('id', v_mid, 'qty', v_q);
      v_qty_total := v_qty_total + v_q;
    end loop;
  end if;
  if v_sig and v_boss.sig_item is not null and v_boss.sig_item <> '' then
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (auth.uid(), v_slot, v_boss.sig_item, 1)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    v_items := v_items || jsonb_build_object('id', v_boss.sig_item, 'qty', 1);
    v_qty_total := v_qty_total + 1;
  end if;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'raid', 'raid_claim:clan:' || v_target,
     v_gold, 0, 0, 0, 0,
     jsonb_build_object('scope', 'clan', 'week', v_target, 'band', v_band,
                        'scale', v_scale, 'tier', coalesce(v_raid.tier, 1),
                        'partial', v_partial, 'factor', v_factor, 'gems_paid', v_gems,
                        'boss_id', coalesce(v_raid.boss_id, ''),
                        'sig', v_sig, 'items', v_items, 'item_qty', v_qty_total));

  -- Clan Standing (unchanged from b412 / 2026-08-12-raid-band-fairness.sql).
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'clans' and column_name = 'standing')
    into v_has_standing;
  if v_has_standing and v_t.tier is not null and v_t.standing > 0 then
    v_standing := floor(v_t.standing * v_factor)::bigint;
    if v_standing > 0 then
      update public.clan_raids set standing_paid = true
        where clan_id = p_clan_id and week_key = v_target and standing_paid = false;
      get diagnostics v_paid = row_count;
      if v_paid > 0 then
        execute 'update public.clans set standing = standing + $1 where id = $2'
          using v_standing, p_clan_id;
        if to_regclass('public.clan_ledger') is not null then
          execute 'insert into public.clan_ledger (clan_id, user_id, kind, qty, standing) values ($1, null, ''tier'', $2, $3)'
            using p_clan_id, v_raid.tier, v_standing;
        end if;
      else
        v_standing := 0;
      end if;
    end if;
  else
    v_standing := 0;
  end if;

  return jsonb_build_object('ok', true, 'scope', 'clan', 'week', v_target,
    'scale', v_scale, 'band', v_band, 'share', v_share, 'members', v_members,
    'ratio', v_ratio, 'damage', v_damage, 'strikes', v_strikes,
    'tier', coalesce(v_raid.tier, 1), 'boss_id', coalesce(v_raid.boss_id, ''),
    'partial', v_partial, 'factor', v_factor, 'sig', v_sig,
    'sig_item', coalesce(v_boss.sig_item, ''), 'standing', v_standing,
    'gold', v_gold, 'gems', v_gems, 'slot', v_slot, 'credited', true,
    'items', v_items);
end $$;
revoke execute on function public.raid_claim__ungated(text, uuid, text, integer)
  from public, anon, authenticated, service_role;

-- ── world_event_claim__ungated ──
create or replace function public.world_event_claim__ungated(p_day_key text, p_slot integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_join     public.world_event_joins%rowtype;
  v_tot      public.world_event_totals%rowtype;
  v_rows     int;
  v_slot     int := coalesce(p_slot, 0);
  v_gold     bigint := 0;
  v_gems     int    := 0;
  v_band     text   := 'none';
  v_held     boolean := false;
  -- themed-chest locals
  v_chest    jsonb;
  v_gold_out bigint;
  v_gems_out int;
  v_it       jsonb;
  v_iid      text;
  v_iqty     bigint;
  v_qty_total bigint := 0;
  -- XP credit locals (2026-10-10-muster-chest-xp-credit.sql)
  v_xc       jsonb;
  v_xp_total bigint := 0;
  v_bud      jsonb;
  v_sk       text;
  v_amt      bigint;
  -- the server's tally and its fixed bands (2026-10-10-rally-points-server.sql)
  v_ref      jsonb;
  v_bands    jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  if v_join.claimed then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if p_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if now() < v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'still_live',
                              'ends_at', v_join.window_end);
  end if;

  -- ── THE TALLY IS THE SERVER'S. Re-derived from the join character's
  --    journalled activity in [joined_at, window_end] and SET on the row (and
  --    the bar) before anything reads it. A stored number is never trusted.
  v_ref := public.hr_rally_refresh(auth.uid(), p_day_key);
  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  v_bands := public.hr_rally_point_rules(public.hr_rally_event_for_key(v_join.event_key))->'bands';
  if v_join.points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if v_join.points < (v_bands->>'answered')::bigint then
    return jsonb_build_object('ok', false, 'error', 'below_answered',
                              'points', v_join.points, 'need', (v_bands->>'answered')::bigint);
  end if;

  select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  v_held := v_tot.met_at is not null;

  -- FIXED bands (game-designer ruling 2026-10-10): nobody else's tally moves
  -- yours. Ceiling per §5.2: 7,500 gold · 10 gems. No hearth_token.
  v_gold := 1500; v_gems := 2; v_band := 'answered';
  if v_join.points >= (v_bands->>'silver')::bigint then
    v_gold := v_gold + 1500; v_gems := v_gems + 2; v_band := 'silver';
  end if;
  if v_join.points >= (v_bands->>'gold')::bigint then
    v_gold := v_gold + 2000; v_gems := v_gems + 2; v_band := 'gold';
  end if;
  if v_held then
    v_gold := (v_gold * 1.5)::bigint; v_gems := v_gems + 2;
  end if;

  v_chest    := public.hr_rally_chest(v_join.event_key, v_gold, v_gems, 0);
  v_gold_out := coalesce((v_chest->>'gold')::bigint, v_gold);
  v_gems_out := coalesce((v_chest->>'gems')::int,    v_gems);

  v_xc       := public.hr_rally_xp_credit(v_join.event_key, v_chest);
  v_xp_total := coalesce((v_xc->>'total')::bigint, 0);
  if v_xp_total > 0 then
    v_bud := public.hr_day_budget_check(auth.uid(), v_slot, 0, v_xp_total, 0, 0);
    if v_bud is not null then
      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_slot);
    end if;
  end if;

  update public.world_event_joins
     set claimed = true, claimed_at = now()
   where day_key = p_day_key and user_id = auth.uid() and claimed = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  update public.player_state
     set gold = coalesce(gold, 0) + v_gold_out,
         version = version + 1,
         updated_at = now()
   where user_id = auth.uid() and slot = v_slot;
  -- GEMS -> THE ACCOUNT WALLET, ONCE PER ACCOUNT PER DAY (2026-10-19-account-wallet.sql).
  if v_gems_out > 0 then
    v_gems_out := (public.hr_wallet_credit(auth.uid(), v_slot, v_gems_out,
                     'world_event:' || p_day_key, now() + interval '2 days') ->> 'paid')::int;
  end if;

  for v_sk, v_amt in select key, value::bigint from jsonb_each_text(v_xc->'by_skill') loop
    insert into public.player_skills as ps (user_id, slot, skill_id, xp)
      values (auth.uid(), v_slot, v_sk, v_amt)
      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;
  end loop;

  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_slot, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'rally', 'world_event_claim:' || p_day_key,
     v_gold_out, 0, v_xp_total, 0, 0,
     jsonb_build_object('band', v_band, 'held', v_held, 'gems_paid', v_gems_out,
                        'day_key', p_day_key,
                        'event_key', v_join.event_key,
                        'band_gold', v_gold, 'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_xc->'list',
                        'xp_chest', v_chest->'xp',
                        'points', v_join.points, 'bonus', v_join.bonus,
                        'char_slot', v_join.char_slot, 'points_by', v_ref->'by'));

  return jsonb_build_object('ok', true, 'band', v_band, 'held', v_held,
    'gold', v_gold_out, 'band_gold', v_gold, 'gems', v_gems_out,
    'items', v_chest->'items', 'xp', v_xc->'list', 'xp_total', v_xp_total,
    'points', v_join.points,
    'day_key', p_day_key, 'event_key', v_join.event_key, 'slot', v_slot,
    'credited', true, 'chest', true);
end $$;
revoke execute on function public.world_event_claim__ungated(text, integer)
  from public, anon, authenticated, service_role;

-- ── hr_create_character ──
create or replace function public.hr_create_character(p_slot integer default 0)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_slot int;
  v_kit  public.hr_start_kit%rowtype;
  v_n    int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- Validate the slot BEFORE spending any budget. A malformed request should
  -- not be able to consume the honest player's rate allowance.
  v_slot := coalesce(p_slot, 0);
  if v_slot < 0 or v_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  -- ── TWO BUCKETS, AND THE SPLIT IS THE POINT ───────────────────────────
  -- The previous body charged the strict 6/hour CREATION budget on every
  -- call, including calls that create nothing. That was fine while nothing
  -- called it; it is wrong now that the client ENSURES on load, because a
  -- player who reloads seven times in an hour would be refused for doing
  -- nothing unusual, and refusing an ensure is how a real character silently
  -- fails to exist.
  --   ensure_character  60/min  — a cheap guard on one indexed PK lookup, so
  --                               this cannot be used as a free query hammer.
  --   create_character   6/hour — charged ONLY on a path that will actually
  --                               insert. Create-and-delete looping (the abuse
  --                               the original limit was written for) is still
  --                               capped at six.
  if not public.hr_rate_ok(v_uid, 'ensure_character', 60, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'ensure_character') - 60) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'ensure_character', 'rate_limited',
        jsonb_build_object('limit', 60, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'ensure_character') - 60));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- FAST PATH. The overwhelmingly common call is "yes, it is already there".
  -- It takes no lock and spends no creation budget.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false);
  end if;

  -- ── THE HERO-SLOT ENTITLEMENT GATE (2026-09-08-hero-slot-buy.sql) ────
  -- Until this existed, {"p_slot":4} minted a fifth character with a full
  -- starting kit for free — the whole 3,100-gem hero-slot ladder bypassed by
  -- one fetch, five times over. Slot 0 is free and always owned; every slot
  -- above it must be in hr_hero_slots_of (bought, grandfathered, or waived by
  -- Hearth Hall). Placed AFTER the fast path so an existing character can
  -- never be locked out of its own account, and BEFORE the advisory lock and
  -- the 6/hour creation budget so a refusal costs neither.
  if v_slot > 0 and not (public.hr_hero_slots_of(v_uid) @> to_jsonb(v_slot)) then
    perform public.hr_record_rejection(v_uid, v_slot, 'create_character', 'slot_not_owned',
      jsonb_build_object('slot', v_slot, 'owned', public.hr_hero_slots_of(v_uid)), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_not_owned', 'slot', v_slot);
  end if;

  -- ── SERIALISE (D1) ────────────────────────────────────────────────────
  -- Transaction-scoped, so it is released by COMMIT or ROLLBACK and cannot be
  -- leaked by an early return or an exception — unlike pg_advisory_lock(),
  -- which needs a matching unlock on every path and is held on a POOLED
  -- connection that outlives the request.
  -- The key is namespaced by a literal so it cannot collide with any other
  -- advisory lock in this schema, and keyed per (user, slot) so two players —
  -- or one player's two slots — never queue behind each other.
  perform pg_advisory_xact_lock(
    hashtextextended('hr_create_character:' || v_uid::text || ':' || v_slot::text, 0));

  -- RE-CHECK UNDER THE LOCK. The loser of a race arrives here after the winner
  -- has committed and takes the idempotent branch. This is the line that makes
  -- the handler below unreachable in practice — which is exactly why the
  -- handler is still there.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false, 'raced', true);
  end if;

  if not public.hr_rate_ok(v_uid, 'create_character', 6, interval '1 hour') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'create_character') - 6) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'create_character', 'rate_limited',
        jsonb_build_object('limit', 6, 'per', '1 hour'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'create_character') - 6));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_kit from public.hr_start_kit;
  if not found then
    -- Unreachable given §0, and it stays here anyway: a kitless character is
    -- worse than a refused one, because nothing downstream would ever notice.
    return jsonb_build_object('ok', false, 'error', 'no_start_kit');
  end if;

  -- ── THE INSERT, AND THE SECOND LOCK ───────────────────────────────────
  -- An `exception` clause opens a subtransaction, so if the primary key does
  -- fire, everything inside this block unwinds and the caller still gets a
  -- verdict rather than a 500. `raced` distinguishes it in the ledger of
  -- outcomes without pretending it did not happen.
  begin
    insert into public.player_state
      (user_id, slot, gold, hp, max_hp, bank_cap,
       active_kind, active_id, active_since, accrued_to)
      values (v_uid, v_slot, v_kit.gold,
              -- hp is clamped to max_hp here rather than trusted: the kit is
              -- generated data and a CHECK cannot express a cross-column rule
              -- that the generator might one day break.
              least(v_kit.hp, v_kit.max_hp), v_kit.max_hp, v_kit.bank_cap,
              -- A new character is idle, and `accrued_to` is NOW. Not
              -- `created_at`, not a client value, not null — an accrual
              -- watermark that starts anywhere but now() is a free grant of
              -- however long the gap is.
              'idle', null, null, now());
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false, 'raced', true);
  end;

  -- THE ACCOUNT WALLET (2026-10-19-account-wallet.sql). Gems and Hearth Tokens
  -- are ONE balance per account, not per character, so the kit's gems are paid
  -- ONCE PER ACCOUNT under the 'start_kit' grant key: a second, third or fifth
  -- character is created with gold and no gems. hearth_tokens are not paid here
  -- at all: the kit's column is CHECK (= 0) and the bond is IAP-only.
  perform public.hr_wallet_ensure(v_uid);
  if coalesce(v_kit.gems, 0) > 0 then
    perform public.hr_wallet_credit(v_uid, v_slot, v_kit.gems, 'start_kit', null);
  end if;

  -- Skills: a row per skill IN THE CATALOGUE, with the starting XP from the
  -- kit. Adding a skill to src/data/skills.js therefore gives every new
  -- character that skill at 0 with no edit here and no edit to the kit.
  insert into public.player_skills (user_id, slot, skill_id, xp)
    select v_uid, v_slot, k.skill_id, coalesce(s.xp, 0)
      from public.hr_skills k
      left join public.hr_start_skill_xp s on s.skill_id = k.skill_id;

  insert into public.player_inventory (user_id, slot, item_id, qty)
    select v_uid, v_slot, i.item_id, i.qty from public.hr_start_inventory i;

  insert into public.player_equipment (user_id, slot, equip_slot, item_id)
    select v_uid, v_slot, e.equip_slot, e.item_id from public.hr_start_equipment e;

  -- ⚠ CONSERVATION: starting equipment is NOT also placed in the inventory.
  -- hr_apply's equip/unequip pair conserves the total count of an item across
  -- the two tables (player-state.sql §3, review S4), so seeding a sword into
  -- BOTH would let the player unequip it and hold two. The bootstrap is the
  -- one place in the system that legitimately creates items from nothing, and
  -- it must create each of them exactly once.

  if v_kit.farm_plots > 0 then
    insert into public.player_farm (user_id, slot, plot_idx)
      select v_uid, v_slot, g from generate_series(0, v_kit.farm_plots - 1) g;
  end if;

  -- ONE ledger row, not one per grant. (Journal rule 6: game_events reached
  -- 1.6M rows / 229 MB from six players in four days by journalling per-event.)
  -- `gold` carries the starting grant so the rollup's `gold_in` accounts for
  -- every gold that has ever entered the economy, including this.
  select count(*) into v_n from public.hr_start_inventory;
  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
    values (v_uid, v_slot, 'admin', 'create_character', v_kit.gold,
            jsonb_build_object('slot', v_slot, 'kit_gold', v_kit.gold,
                               'kit_items', v_n, 'plots', v_kit.farm_plots,
                               'catalogue', (select digest from public.hr_catalogue_meta)));

  -- ── THE FREE ENTRY TRAIT (Designer ruling, b497) ──────────────────
  -- Auto-Eat I is granted at creation. NOT because it is generous — because
  -- the away engine BREAKS on the first death, so a 10-max-HP character who
  -- leaves a fight running is credited 30 seconds of a twelve-hour night. The
  -- idle pillar was off by default for every new account, behind a 15-Mark
  -- toll that takes ~100 kills to reach. auto_eat_2 (100 Marks, the settable
  -- threshold) is untouched: the sink survives, the entry tax does not.
  --
  -- THE SAME ROW hr_trait_buy §8 writes — kind='flag', period_key='' — which
  -- is the exact shape hr_auto_eat_tier reads and the player_progress unlock
  -- guard polices. ON CONFLICT because creation is an ENSURE and this must be
  -- as re-runnable as everything above it.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'flag', 'trait:auto_eat', 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- ⚠ SWITCHED ON BY THE BOOTSTRAP, **NOT** BY hr_set_auto_eat, AND THE
  -- REASON IS AN INVARIANT SOMEBODY ELSE OWNS. hr_set_auto_eat is the single
  -- writer of these columns for every LATER change and stays so — but it also
  -- (a) bumps `version` and (b) writes a set_auto_eat player_ledger row, both
  -- correctly, because a settings change mid-absence has to invalidate an
  -- in-flight accrual and has to be auditable. At CREATION those two side
  -- effects are read by 2026-08-17-cutover-import.sql §(e) as the DEFINITION of
  -- "this character has already played" (version > 0, or any non-create_character
  -- ledger row since created_at), so calling it here makes the cutover ceremony
  -- refuse EVERY player. Measured on a full PGlite replay, not reasoned about:
  -- the first draft of this patch turned every cutover-import snapshot red.
  --
  -- This is therefore the bootstrap writing a column of the row it is creating,
  -- in the transaction that creates it, under the advisory lock — the same thing
  -- it already does for gold, gems, hp, bank_cap and accrued_to. It can never
  -- touch an existing character's settings.
  --
  -- THE CLAMP IS NOT DUPLICATED: this is the exact expression hr_set_auto_eat
  -- evaluates, reading the tier from the flag row written immediately above, so
  -- neither the ceiling NOR the tier is restated here. The day
  -- AUTO_EAT_TIERS[1] moves, both paths follow it.
  update public.player_state
     set auto_eat_enabled = true,
         auto_eat_pct     = public.hr_auto_eat_max_pct(
                              public.hr_auto_eat_tier(v_uid, v_slot))
   where user_id = v_uid and slot = v_slot;

  return jsonb_build_object('ok', true, 'slot', v_slot, 'created', true);
end $$;
revoke execute on function public.hr_create_character(integer)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_create_character(integer) to authenticated;

-- ── hr_state_of ──
create or replace function public.hr_state_of(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
-- hr_state_of restated 2026-09-14 (2026-09-14-hr-state-of-restatement.sql) — chain depth 0;
-- restated again WHOLE by 2026-10-19-account-wallet.sql (gems + hearth_tokens read
-- from public.account_wallet, the ACCOUNT's balance, identical on every slot).
-- This body is AUTHORED HERE. Do not add an anchored programmatic patch to it:
-- tests/patch-chain-guard.mjs refuses a third one, and twenty-four of them are
-- how the envelope every client renders came to exist in no file at all.
declare v_st public.player_state%rowtype;
        v_w  public.account_wallet%rowtype;
begin
  -- ── THE CHARACTER ROW, AND THE ENVELOPE ROOT (ok / version / now) ──
  --    introduced by 2026-08-11-apply-engine.sql
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- THE ACCOUNT WALLET. One PK probe; a missing row reads 0 (never NULL), so an
  -- account the wallet has not met yet renders an honest zero, not "unknown".
  select * into v_w from public.account_wallet where user_id = p_user;

  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    -- CONSUMABLE BUFFS (2026-09-13). The character's own timed-consumable queue,
    -- written only by hr_apply's buff_apply block from hr_item_buffs + now().
    -- `until` is the authority; `remaining_ms` is the server's own subtraction
    -- against the same now() this envelope reports, so no client clock is ever an
    -- input to how long a buff has left. Ordered by expiry so the soonest is
    -- first. Expired entries are carried with remaining_ms = 0 — the away engine
    -- needs a buff that was alive at the START of the window it prices, and the
    -- renderer filters on remaining_ms > 0.
    -- ── buffs — THE CONSUMABLE QUEUE, with a SERVER-derived remaining_ms ──
    --    introduced by 2026-09-13-consumable-buffs.sql
    --    `scale` was added by 2026-09-13-buff-cellar-scale.sql
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
               -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql). The
               -- engine does not pay a segment before it; null on a row written
               -- before the key existed (the engine then assumes the earliest
               -- start the one-hour ceiling allows).
               'from', e.v->>'from',
               -- THE PERK MULTIPLIER THIS SEGMENT WAS STAMPED WITH (step 3).
               -- Display only — the time it bought is already in `until`, and a
               -- segment written before the Cellar was priced has no key and is
               -- honestly 1.0 rather than absent, because an absent number is one
               -- a renderer has to guess at.
               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor(
                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)
               order by (e.v->>'until')::timestamptz)
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
    ), '[]'::jsonb),
    -- place (2026-09-13): the character's OWN position in the live world, and
    -- nothing about anybody else. Week 1 has one zone, so `zone` is a server
    -- constant (hr_town_zone) rather than a column — Week 2 adds player_state
    -- .zone_id and this line reads it instead. `quiet` is the stalking opt-out,
    -- projected so the toggle survives a reload without living in the residue (a
    -- client-held privacy flag is a privacy flag a reload loses). PEERS ARE NOT
    -- HERE AND MUST NEVER BE: this envelope is version-gated, and peer motion in
    -- it would be a version_conflict storm. They come from hr_town_of.
    -- ── place — THE CHARACTER'S OWN POSITION. PEERS ARE NEVER HERE ──
    --    introduced by 2026-09-13-town-presence.sql
    'place', jsonb_build_object(
      'zone', public.hr_town_zone(),
      'quiet', coalesce(v_st.presence_quiet, false)),
    -- dungeon re-entry cooldown (2026-09-12): the ACTIVE windows only, PER DUNGEON
    -- and PER MODE — { dungeon_id: { auto: ISO, manual: ISO, scavenger: ISO } },
    -- each mode waiting cooldown_s / its divisor (Designer ruling: scavenger is a
    -- quarter window, not an exemption). Derived by hr_dungeon_cooldowns from the
    -- append-only ledger + the catalogue — THE SAME function hr_dungeon_settle's
    -- gate (c) refuses on, so the countdown shown and the window enforced are one
    -- number. Was a client-clock `G.dungeons.lastRun` in the residue, which the
    -- armed path had stopped stamping at all. An expired mode is omitted, a dungeon
    -- with no active mode is omitted, a fresh character gets {}; an absent key on
    -- the client means READY, which is safe because the SERVER refuses — the worst
    -- case is one refused intent. The client reads map[dungeon_id][mode].
    -- ── dungeon_cooldowns — the ACTIVE windows, per dungeon and per mode ──
    --    introduced by 2026-09-12-dungeon-cooldown.sql
    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),
    -- ── state — THE FLAT SCALAR BAG (opens here, closes at combat_style) ──
    --    introduced by 2026-08-11-apply-engine.sql
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', coalesce(v_w.gems, 0),
      -- Bounty-Marks server-of-record slice: the marks currency the bounty
      -- turn-in (hr_claim_bounty) already credits into player_state.marks. Flat
      -- scalar beside gold/gems so src/net/record.js reads it the SAME way it
      -- reads gold — a moved-but-UNKNOWN marks balance renders a pending glyph,
      -- never a forgeable local number. Additive; nothing else changes.
      -- ── state.marks — the Bounty-Marks currency ──
      --    introduced by 2026-08-26-marks-record.sql
      'marks', v_st.marks,
      -- dungeon-scrip: the server-owned Dungeon Scrip currency, credited by
      -- hr_dungeon_settle. Flat scalar beside marks so src/net/record.js reads it
      -- the SAME way it reads gold/marks — a moved-but-UNKNOWN scrip balance
      -- renders a pending glyph, never a forgeable local number. Never an
      -- inventory item, never a residue mirror (dungeon-settlement.md §1).
      -- ── state.dungeon_scrip — the Dungeon Scrip currency ──
      --    introduced by 2026-09-10-dungeon-scrip.sql
      'dungeon_scrip', v_st.dungeon_scrip,
      -- ── state — tokens, hit points, the bank cap and the activity pointer ──
      --    introduced by 2026-08-11-apply-engine.sql
      'hearth_tokens', coalesce(v_w.hearth_tokens, 0),
      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- worker-settlement slice: the hired crew's own accrual watermark. The
      -- accrual shell reads it as `st.workers_accrued_to` and settles
      -- [workers_accrued_to, now()] alongside the pointer. Flat, like the other
      -- watermarks, so a nested bag cannot hide a missing column behind a default.
      -- ── state.workers_accrued_to — the hired crew's own watermark ──
      --    introduced by 2026-08-25-workers.sql
      'workers_accrued_to', v_st.workers_accrued_to,
      -- ── state.combat_xp_accrued_to — the combat-XP cadence watermark ──
      --    introduced by 2026-08-31-combat-xp-credit.sql
      'combat_xp_accrued_to', v_st.combat_xp_accrued_to,
      -- rested-record (b437): the bank charge count + its wall-clock watermark,
      -- flat like the other watermarks so a nested bag cannot hide a missing
      -- column behind a default. The accrual shell reads them as st.rested_xp /
      -- st.rested_at and settles [rested_at, now()] alongside the pointer.
      -- ── state.rested_xp / rested_at — the rested bank and its watermark ──
      --    introduced by 2026-08-22-rested-record.sql
      'rested_xp', v_st.rested_xp,
      'rested_at', v_st.rested_at,
      -- AUTO-EAT. Flat keys rather than a nested object because the accrual
      -- shell reads them field by field off `st` and a nested bag would be one
      -- more place a `?? {}` could quietly turn a missing column into a
      -- default. `auto_eat_enabled` is the purchased-trait receipt.
      -- ── state.auto_eat_* — FLAT, never nested ──
      --    introduced by 2026-08-15-auto-eat.sql
      'auto_eat_enabled', v_st.auto_eat_enabled,
      'auto_eat_food', v_st.auto_eat_food,
      'auto_eat_pct', v_st.auto_eat_pct,
      -- b348: THE GATHERING TOOL CARRY. Its presence here is what tells the
      -- accrual engine the server owns the carry — `st.tool_carry ?? null`, and
      -- the null branch omits the delta key. Never nested, for the same reason
      -- the auto-eat keys are flat.
      -- ── state.tool_carry — the gathering carry the SERVER owns ──
      --    introduced by 2026-08-15-tool-carry.sql
      'tool_carry', v_st.tool_carry,
      -- THE HEARTHFIND's self-configuring switch. Always true once
      -- 2026-09-08-hearthfind.sql has run; read by hr-accrue to decide whether
      -- to propose delta.hearthfind at all. Not a feature flag.
      -- ── state.hearthfind_* — the switch, the day’s find, the titles, the plinth ──
      --    introduced by 2026-09-08-hearthfind.sql
      'hearthfind_ready', true,
      -- THE DAY'S LATEST FIND, so a RETRIED SETTLE DOES NOT LOSE THE REVEAL.
      -- hr_apply's replay path returns `hr_state_of(...) || {replayed:true}` --
      -- a FRESH envelope, deliberately, because storing the receipt would put a
      -- full snapshot in player_intents (revision 2 did, at ~690 MB per player
      -- per day). The consequence is that the `hearthfind` field of the
      -- ORIGINAL receipt exists only on the first response: a settle whose
      -- reply is lost to a dropped connection is retried, comes back ok, and
      -- the player is never told about the rarest thing that has ever happened
      -- to them. The trophy and the ledger row were never at risk; only the
      -- MOMENT was, and the moment is the entire feature.
      --
      -- Projected from the append-only journal (the only durable record) rather
      -- than from world_finds, because the public row is suppressed by the
      -- 60-second broadcast clamp while the ledger row never is. Scoped to the
      -- UTC day so it is self-expiring: there is no state to clear, no flag to
      -- reset, and a client that has already revealed it simply sees the same
      -- object again (it carries `at`, so the client can tell). One index probe
      -- on player_ledger_hearthfind_idx; null on the ~100% of reads with no
      -- find today.
      'hearthfind_last', (
        select jsonb_build_object('item', l.item_id, 'at', l.at) || coalesce(l.meta, '{}'::jsonb)
          from public.player_ledger l
         where l.user_id = p_user and l.slot = p_slot and l.kind = 'hearthfind'
           and l.at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
         order by l.at desc limit 1),
      -- THE COSMETICS THE CHARACTER OWNS. Projected from the server table, not
      -- carried in the residue: a title is earned state, and CLAUDE.md §6 is
      -- explicit that anything a player would miss after a reload lives in a
      -- server row and is projected. Two arrays and one boolean, all derived:
      --   hearthfind_titles  every title unlocked, newest last
      --   hearthfind_plinth  whether the homestead plinth is unlocked
      -- The EQUIPPED title is deliberately absent until an equip intent exists;
      -- a client that picked one would be authoring it, and there is no RPC yet
      -- that would let the server own that choice. Stated as a known limitation
      -- rather than shipped as a residue field.
      'hearthfind_titles', coalesce((
        select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'at', c.granted_at)
                         order by c.granted_at)
          from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'title'), '[]'::jsonb),
      'hearthfind_plinth', exists (
        select 1 from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'plinth'),
      -- Phase 0: THE IN-FLIGHT FIGHT. Its presence here is what tells the
      -- accrual engine the server owns the fight — `st.fight ?? null`, and the
      -- null branch omits the delta key, exactly as tool_carry does. Never
      -- nested, for the same reason the auto-eat keys are flat.
      -- ── state.fight — the IN-FLIGHT fight the server owns ──
      --    introduced by 2026-08-17-fight-carry.sql
      'fight', v_st.fight,
      -- First-Night Idle Rescue: THE RECOVERY LINE. An absolute server instant
      -- before which the character is Knocked Out - no swing, no gather, no XP,
      -- no loot, no food. Flat, like every other watermark, so a nested bag
      -- cannot hide a missing column behind a default. NULL here means "up";
      -- an ABSENT KEY means "this database predates Recovery", and the engine
      -- distinguishes those two by presence, never by coalescing.
      -- ── state.recovering_until — the Recovery line (a death is never a free heal) ──
      --    introduced by 2026-09-06-recovering-until.sql
      'recovering_until', v_st.recovering_until,
      -- THE RETREAT (Recovery rev. 3): CONSECUTIVE falls with no kill between
      -- them. Flat, beside the recovery line, because they are two halves of one
      -- survival rule and a nested bag would let a missing column hide behind a
      -- default. It is `not null default 0`, so unlike recovering_until there is
      -- no "present but null" state to distinguish - the KEY'S PRESENCE alone is
      -- the engine's switch, and its absence is the pre-Retreat behaviour.
      -- ── state.consec_falls — the Retreat counter (Recovery rev. 3) ──
      --    introduced by 2026-09-07-retreat.sql
      'consec_falls', v_st.consec_falls,
      -- HUNT STANCE AND STOP (2026-09-22). The two standing orders, projected
      -- RAW: NULL means "no stance chosen" (which the engine reads as steady,
      -- today's behaviour) and an ABSENT KEY means "this database predates
      -- hunts". The client distinguishes those two by PRESENCE, never by
      -- coalescing - so an older deployment renders no Hunt panel rather than
      -- a fabricated one.
      'hunt_stance', v_st.hunt_stance,
      'hunt_stop', v_st.hunt_stop,
      -- THE LAST AWAY-CLASSIFIED RECEIPT (2026-09-07 ruling). Projected RAW and
      -- FLAT, like every other watermark on this envelope. NULL means "this
      -- character has never been away"; an ABSENT KEY means "this database
      -- predates the receipt" - and the client distinguishes those two by
      -- PRESENCE, never by coalescing, so an older deployment renders silence
      -- rather than a fabricated empty night.
      -- ── state.last_away_receipt — projected RAW; NULL and ABSENT differ ──
      --    introduced by 2026-09-07-last-away-receipt.sql
      'last_away_receipt', v_st.last_away_receipt,
      -- Recovery rev. 2: THE LADDER'S TWO ANCHORS, projected as SCALARS.
      -- They are the same two player_progress rows the accrual delta writes
      -- (kind='stat' key='deaths', period='' and period=<UTC day>), read here
      -- DIRECTLY rather than left to be dug out of the 'progress' array above
      -- - that array is `limit 1000` and carries `progress_truncated`, and a
      -- character with enough collection rows would silently read as one who
      -- has never died and get a free fall on every settle. A survival
      -- mechanic must not depend on a truncatable read. The day key is
      -- hr_utc_day_key, the SAME spelling src/core/goals.js utcDayKey
      -- produces, so the row the engine writes is the row this reads.
      -- ── state.deaths_* — the ladder's two anchors, read DIRECTLY (never off the truncatable `progress` array) ──
      --    introduced by 2026-09-06-recovering-until.sql
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0),
      -- HAS THE AUTO-EAT SWITCH EVER BEEN TOUCHED? A boolean, never the
      -- timestamp: the client only needs to know whether to make the one-time
      -- switch-on offer, and projecting the instant would invite a renderer to
      -- do arithmetic on it.
      -- ── state.auto_eat_touched — a boolean, never the instant ──
      --    introduced by 2026-09-06-recovering-until.sql
      'auto_eat_touched', (v_st.auto_eat_set_at is not null),
      -- Slice 3: the daily settle STREAK, server-owned, advanced only inside
      -- hr_apply from now(). Projected so the client can render it; never read
      -- for authority, and there is no present:true field anywhere.
      -- ── state.streak_days — the daily settle streak ──
      --    introduced by 2026-08-21-streak-state.sql
      'streak_days', v_st.streak_days,
      -- farm-projection (Q-2): the SERVER-owned farm plot tier, written ONLY by
      -- hr_farm_upgrade_plot. Flat scalar like the other server-owned scalars, so
      -- accrue.js reconcileFarm mirrors it into G.plotLevels on every load. Before
      -- this key existed an armed client fell back to getPlotLevel()'s Lv 1
      -- fail-safe on every reload: unlocked seeds vanished and the Upgrade button
      -- quoted the wrong tier's price. The client NEVER computes this.
      -- ── state.plot_level — the SERVER-owned farm plot tier ──
      --    introduced by 2026-09-06-state-of-farm-projection.sql
      'plot_level', v_st.plot_level,
      -- ── state.streak_day_key — the streak’s UTC day key ──
      --    introduced by 2026-08-21-streak-state.sql
      'streak_day_key', v_st.streak_day_key,
      -- combat-style slice: the player's per-weapon-family style choice, e.g.
      -- {"sword":"defensive"}. Written ONLY by hr_set_style. The accrual engine
      -- reads it as `st.combat_style` and passes it through
      -- normaliseStyleKeys -> resolveStyle, which is what makes an AWAY fight
      -- train the skill the player actually picked. A PARTIAL map is normal;
      -- `{}` means "chosen nothing" and every family falls to its default.
      -- ── state.combat_style — the per-family style choice (CLOSES `state`) ──
      --    introduced by 2026-08-24-combat-style.sql
      'combat_style', coalesce(v_st.combat_style, '{}'::jsonb)),
    -- ── skills / inventory — the two maps the client renders from ──
    --    introduced by 2026-08-11-apply-engine.sql
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_level_from_xp(xp),
               -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql). The
               -- engine's input (envelope.js xpFrac); the client renders `xp`.
               'frac', xp_frac))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- bank-store (b438): the BANK item container, server-owned
    -- (player_bank, no client write policy), projected as a flat {item_id:qty}
    -- map beside `inventory`. The client folds it through the SAME
    -- serverOwnedItem carve-out and the SAME inventory arm as the bag. Absent
    -- row = real zero (qty>0 invariant + delete-on-zero in hr_bank_move).
    -- ── bank — the server-owned bank container, beside `inventory` ──
    --    introduced by 2026-08-27-bank-store.sql
    'bank', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_bank where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ── equipment — the worn set ──
    --    introduced by 2026-08-11-apply-engine.sql
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant,
    -- `{ <equip_slot>: <element> }`. Read here so the client renders it and the
    -- accrual shell builds `eq` from equipment + this (accrual.js weakness()),
    -- never from a client value. `{}` when nothing is enchanted.
    -- ── enchant — ELEMENTS v1, the server-owned weapon enchant ──
    --    introduced by 2026-08-18-enchant.sql
    'enchant', coalesce(v_st.enchant, '{}'::jsonb),
    -- worker-settlement slice: the hired crew, server-owned (player_workers, no
    -- client write policy). The accrual shell reads this as `env.workers` and
    -- settles each assigned worker; the client renders it and computes no yield.
    -- ── workers — the hired crew (hired_at added 2026-09-12-worker-hired-at-projection.sql) ──
    --    introduced by 2026-08-25-workers.sql
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object('uid', uid, 'name', name,
                                          'skill', skill, 'target_id', target_id,
                                          'xp', xp, 'acc_ms', acc_ms,
                                          -- worker hire floor (2026-09-09 P0): the engine pays a
                                          -- worker only for time it has EXISTED. The shared
                                          -- workers_accrued_to watermark is stale by construction
                                          -- for a character who never had a crew, so without this
                                          -- the first hire collects a 24h backlog.
                                          'hired_at', hired_at)
                       order by uid)
        from public.player_workers where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── farm — the plots, with the FULL waterings array (Q-5) ──
    --    introduced by 2026-08-11-apply-engine.sql
    --    `waterings` was added by 2026-09-06-state-of-farm-projection.sql
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at,
                                          -- farm-projection (Q-5): the FULL watering history, the
                                          -- exact array hr_farm_growth_hours() reads. Projected
                                          -- whole because growth is the clipped 2h-window OVERLAP
                                          -- sum, which no count/last pair can reproduce — a lossy
                                          -- shape makes the client's isReady disagree with the
                                          -- server's and strands a ready crop behind a Water
                                          -- button. NOT NULL in the table; coalesce is belt-and-
                                          -- braces so a future nullable column can never emit a
                                          -- json null the client would have to special-case.
                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── progress / progress_truncated — capped at 1000 rows, and it SAYS when it capped ──
    --    introduced by 2026-08-11-apply-engine.sql
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
                 -- Slices 1+2: the bestiary (ev:kill_monster:%) and collection
                 -- (ev:loot:%) populations are served by hr_bestiary_of /
                 -- hr_collection_of; together they approach the 1000-row cap, so
                 -- they are kept OUT of the generic envelope in one reviewed change.
                 and key not like 'ev:kill_monster:%'
                 and key not like 'ev:loot:%'
                 -- 2026-09-22: the TROPHY population (docs/design/BESTIARY_LADDER.md
                 -- §6). Claimed trophy rows are served by hr_trophy_of, beside
                 -- hr_bestiary_of / hr_collection_of. 108 kills + up to 432 trophies
                 -- + the collection log breach this 1000-row cap, and the failure is
                 -- SILENT: kind='collection' sorts ahead of daily/flag/quest/stat,
                 -- so what falls off the end is a player's quest state.
                 and key not like 'trophy:%'
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
           -- 2026-09-22: the TROPHY population. The SAME predicate as the one
           -- inside `progress` above, and it must stay the same: a flag that
           -- counted rows the array excludes would report truncation that did
           -- not happen, which is the read filter / prune divergence RL3 names.
           and key not like 'trophy:%'
         limit 1001) t),
    -- ── client_state — the denylisted client-preference bag ──
    --    introduced by 2026-08-28-client-state.sql
    'client_state', coalesce(v_st.client_state, '{}'::jsonb),
    -- ── total_level — derived server-side ──
    --    introduced by 2026-08-11-apply-engine.sql
    'total_level', public.hr_total_level(p_user, v_st.slot),
    -- hunt-analyzer (2026-09-22): the last settled reading of the running hunt,
    -- or NULL when this character is not on a combat pointer. Nothing here is
    -- extrapolated between settles and nothing is merged upward.
    'hunt_analyzer', public.hr_hunt_analyzer(p_user, v_st.slot),
    -- vigour (2026-09-22): the daily hunting budget, derived and spent. One
    -- object, so the panel renders a bar and a sentence without holding any
    -- arithmetic of its own. Two indexed reads on player_progress, both on the
    -- (user, slot, kind, key, period) leading edge.
    'vigour', public.hr_vigour_of(p_user, v_st.slot),
    -- recipe-learn (2026-09-14): the gated recipes THIS CHARACTER has learned,
    -- in the client's own `{ "<scroll_id>": true }` shape. Written only by
    -- hr_recipe_learn (there is no client write policy and no client write grant
    -- on player_progress); the SAME rows hr_perks_of hands the away engine, so
    -- the attended screen and the night finally read one set. `{}` on a fresh
    -- character is a known state, not an error: no row is a LOCKED recipe.
    -- ── unlocked_recipes — the gated recipes THIS character has learned ──
    --    introduced by 2026-09-14-recipe-learn.sql
    'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot),
    -- gem-unlock-buy (2026-09-14): the themes and cosmetics this ACCOUNT owns,
    -- as a flat array of '<namespace>:<id>'. Written only by hr_buy_gem_unlock
    -- (there is no client write policy and no client write grant on
    -- player_progress), read by src/legacy.js ownsGemUnlock so ownership stops
    -- living in the residue a cloud restore can rewind — the half of the b371
    -- gem dupe that made a free theme STICK. Always contains the FREE rows
    -- (theme:default), so the starting theme stays equippable the moment the
    -- client reads this set server-first. Never truncated: an entitlement must
    -- not be able to read as "you own nothing".
    -- ── gem_unlocks — the ACCOUNT’s entitlements. NEVER truncated ──
    --    introduced by 2026-09-14-gem-unlock-buy.sql
    'gem_unlocks', public.hr_gem_unlocks_of(p_user, v_st.slot),
    -- THE SERVER'S COUNTED RENOWN (2026-09-12). The high-water hr_claim_rank
    -- decides every rank against, cached on player_state by the ratchet §1 added
    -- to hr_apply. Read straight off the row this function already selected, so
    -- the projection is free; the recompute lives on the apply path where it is
    -- floored at one call per intent instead of one per envelope.
    -- DISPLAY + the rank-up card only — the client authors none of it, there is
    -- no client write policy or grant on player_state, and hr_renown_of stays
    -- revoked from every browser role. This is the caller's OWN character (the
    -- whole body is keyed on p_user/v_st.slot); no other player's score is
    -- reachable through it. 0 on a fresh character, never null.
    -- ── renown_high — the SERVER’s counted renown, display only ──
    --    introduced by 2026-09-12-renown-high-projection.sql
    'renown_high', coalesce(v_st.renown_high, 0),
    -- THE ACTIVE BOUNTY, AND THE SERVER'S OWN PROGRESS ARITHMETIC (2026-09-09).
    -- `progress` is the SAME expression hr_claim_bounty judges the turn-in by:
    -- hr_bounty_kills(target) - baseline, i.e. kills since accept, counting the
    -- away/settle kills the client cannot see (ev:kill_monster:% is excluded
    -- from the `progress` array on purpose — the bestiary is hr_bestiary_of's).
    -- Display + turn-in trigger only; the client authors none of it, and
    -- active_bounty is SELECT-only to browser roles. NULL = no active contract.
    -- ── bounty — the active contract and the SERVER’s own progress arithmetic ──
    --    introduced by 2026-09-09-bounty-progress-projection.sql
    'bounty', (select jsonb_build_object(
                 'bounty_id',   b.bounty_id,
                 'b_type',      b.b_type,
                 'difficulty',  b.difficulty,
                 'target',      b.target,
                 'tier',        b.tier,
                 'required',    b.required,
                 'baseline',    b.baseline,
                 'accepted_at', b.accepted_at,
                 'kills_now',   k.v,
                 'progress',    greatest(0, k.v - b.baseline))
                 from public.active_bounty b
                 cross join lateral (select public.hr_bounty_kills(p_user, v_st.slot, b.target) as v) k
                where b.user_id = p_user and b.slot = v_st.slot),
    -- hero-slot-buy: the ACCOUNT's owned hero slots, as a flat int array.
    -- ACCOUNT-scoped (no v_st.slot) because a hero slot is an account
    -- entitlement, unlike every other projection in this envelope. Written only
    -- by hr_buy_hero_slot; read by the client so ownership survives a device
    -- change without the save blob, which is the store the b371 gem dupe lived
    -- in. Never truncated — an entitlement must not become "you own nothing".
    -- `[0]` is a valid known state: a fresh account owns only the free slot.
    -- ── hero_slots — ACCOUNT-scoped entitlement. NEVER truncated ──
    --    introduced by 2026-09-08-hero-slot-buy.sql
    'hero_slots', public.hr_hero_slots_of(p_user),
    -- trait-buy: the character's OWNED PERMANENT TRAITS, as a flat id array.
    -- Written only by hr_trait_buy; read by the client to hydrate G.traits on
    -- boot so ownership survives a device change without the save blob. Read
    -- UNFILTERED (not through the LIMIT-ed `progress` array) — an entitlement
    -- must never be truncated into "you own nothing". `[]` is a valid known
    -- state: a fresh character owns no traits.
    -- ── traits — owned permanent traits, read UNFILTERED ──
    --    introduced by 2026-08-23-trait-buy.sql
    'traits', coalesce((
      select jsonb_agg(substring(pp.key from 7) order by pp.key)
        from public.player_progress pp
       where pp.user_id = p_user and pp.slot = v_st.slot
         and pp.kind = 'flag' and pp.period_key = ''
         and pp.key like 'trait:%' and pp.value > 0), '[]'::jsonb),
    -- companion-record (blob-retire capstone): the FULL roster the client rebuilds
    -- G.companions from under arm — equipped id + owned set + per-id XP. hr_perks_of
    -- carries only the EQUIPPED companion's {id,xp} for pricing; this carries the
    -- whole set so the reconstruction cannot silently reset a player's roster/XP.
    -- The starter 'fox' is owned by grammar (no unlock row) and is unioned in by
    -- the client, so it is deliberately absent from `owned`.
    -- ── companions — the FULL roster (equipped + owned + per-id XP) ──
    --    introduced by 2026-08-22-companion-record.sql
    'companions', jsonb_build_object(
      'equipped', v_st.companion_equipped,
      'owned', coalesce((
        select jsonb_agg(substring(pp.key from 11) order by pp.key)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'unlock' and pp.period_key = ''
           and pp.key like 'companion:%' and pp.value > 0), '[]'::jsonb),
      'xp', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.value)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and left(pp.key, 13) = 'companion_xp:'), '{}'::jsonb),
      -- ^ an EXACT prefix since 2026-10-12 (was `like`, whose `_` matched any
      -- character): a row is projected as a pet's XP only under the key
      -- hr_apply equipped-checks and caps.
      -- THE PET'S CARRIED XP REMAINDER (2026-10-12-companion-xp-frac.sql). The
      -- engine's input (envelope.js companionXpFrac); non-zero only, absent = 0.
      'frac', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.xp_frac)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and left(pp.key, 13) = 'companion_xp:' and pp.xp_frac > 0), '{}'::jsonb)),
    -- ── inventory-flip Step B1: THE SERVER-STAMPED COMPLETENESS SIGNAL ───────
    -- TRUE only when the accrual settle loop has NO pending, un-drained window
    -- that could still grant OWNABLE items — i.e. player_inventory is a complete
    -- statement of the owned set and the dormant absolute-replace flip
    -- (src/net/accrue.js envelopeBaselineComplete) may safely fire. Read
    -- src/net/accrue.js:863 and tools/derive-inventory-complete.mjs's header for
    -- why a false negative merely defers the flip (safe) and a false positive
    -- would DELETE a legit crafted stack (the one irreversible mistake).
    --
    -- SINGLE SOURCE OF TRUTH: this reads the engine's OWN completeness watermark,
    -- accrued_to (advanced to now() by, and only by, a full settle), against the
    -- engine's OWN min-span ACCRUE_MIN_MS = 60000 ms (accrual.js). Below that
    -- span the engine settles nothing (SKIP.TOO_SOON) so no grant is pending;
    -- at/above it there is an un-settled payable window → INCOMPLETE. The 60s
    -- literal is pinned to ACCRUE_MIN_MS by tests/inventory-complete-probe.mjs.
    --
    -- FAIL-CLOSED and CHAINED-CRAFT-SAFE (see the tool header): idle/unknown
    -- pointer → no accrual → complete; a payable pointer with a drained window
    -- (< 60s) → complete, because each settle is atomic and collect-before-switch
    -- leaves no cross-pointer chain mid-flight; a payable pointer with an open
    -- window (>= 60s) OR an inconsistent payable row with no active_since →
    -- INCOMPLETE.
    -- ── inventory_complete — the STAMPED completeness signal, fail-closed ──
    --    introduced by 2026-08-24-inventory-complete.sql
    --    the third (worker) arm was added by 2026-08-25-workers.sql
    -- ── must_rename (2026-10-11-name-moderation.sql) ── the player's own
    --    moderation flag; the client opens a non-dismissable rename prompt.
    'must_rename', coalesce((select pr.must_rename from public.profiles pr
                              where pr.id = p_user), false),
    'inventory_complete', (
      case
        when v_st.active_kind is null
          or v_st.active_kind not in ('combat', 'gather', 'artisan')
          or v_st.active_id is null
          then true
        when v_st.active_since is null
          then false
        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
      -- ── THIRD ARM (worker-settlement slice) ──────────────────────────────
      -- Also INCOMPLETE when the crew is non-empty AND its window is open
      -- (>= 60s since workers_accrued_to). The crew read is in THIS transaction —
      -- a lagging read would be a false-positive that lets the flip delete a
      -- pending worker haul. Pinned to ACCRUE_MIN_MS by the probe test.
      and (not exists (select 1 from public.player_workers pw
                        where pw.user_id = p_user and pw.slot = v_st.slot)
           or now() - v_st.workers_accrued_to < interval '60 seconds')
  );
end $$;
revoke execute on function public.hr_state_of(uuid, integer)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, integer) to hr_engine;

-- ── hr_day_budget_used ──
create or replace function public.hr_day_budget_used(p_user uuid, p_slot integer, p_at timestamp with time zone default now())
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_out jsonb;
begin
  select jsonb_build_object(
           'gold', coalesce(sum(gold_in), 0),
           'xp',   coalesce(sum(xp_in),   0),
           'qty',  coalesce(sum(qty_in),  0),
           'rows', count(*),
           'day',  public.hr_utc_day_key(p_at))
    into v_out
    from public.player_ledger
   where user_id = p_user
     and slot    = p_slot
     and at >= public.hr_utc_day_start(p_at)
     and at <  public.hr_utc_day_start(p_at) + interval '1 day';
  -- GEMS ARE THE ACCOUNT'S (2026-10-19-account-wallet.sql), so the gem dimension
  -- of the day budget is summed over EVERY slot of the account: five characters
  -- share one ceiling, not five. Gold / xp / qty stay per character above.
  v_out := v_out || jsonb_build_object('gems',
    (select coalesce(sum(l.gems_in), 0) from public.player_ledger l
      where l.user_id = p_user and l.gems_in > 0
        and l.at >= public.hr_utc_day_start(p_at)
        and l.at <  public.hr_utc_day_start(p_at) + interval '1 day'));
  return v_out;
end $$;
revoke execute on function public.hr_day_budget_used(uuid, integer, timestamp with time zone)
  from public, anon, authenticated, service_role;

-- ── hr_ledger_prune ──
create or replace function public.hr_ledger_prune(p_limit integer default 20000)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_keep int; v_cut timestamptz; v_n int;
begin
  select retain_days into v_keep from public.hr_ledger_config;
  -- One second of slack so the prune never argues with the trigger's own
  -- boundary check about which side of `now()` a row is on.
  v_cut := now() - make_interval(days => coalesce(v_keep, 90)) - interval '1 second';

  -- THE WALLET JOURNAL IS EXEMPT (2026-10-19-account-wallet.sql, Security F2).
  -- The rollup keeps only gems_in, so a pruned kind='wallet' row would lose
  -- every gem DEBIT and the per-hero carry for good. Gem movements are rare
  -- (claims and purchases, never per tick), so the premium currency keeps its
  -- whole signed history: the wallet always equals the sum of its rows.
  with doomed as (
    select id, at from public.player_ledger
     where at < v_cut
       and kind <> 'wallet'
     order by at, id
     limit greatest(1, least(100000, coalesce(p_limit, 20000)))
     for update skip locked
  ),
  rolled as (
    insert into public.player_ledger_rollup as r
      (user_id, slot, month, kind, n, gold_in, gold_out, xp_in, xp_out, qty_in, qty_out, gems_in)
      select l.user_id, l.slot, date_trunc('month', l.at)::date, l.kind,
             count(*),
             sum(greatest(coalesce(l.gold, 0), 0)),
             sum(greatest(-coalesce(l.gold, 0), 0)),
             -- xp is SIGNED and carries NO non-negative CHECK (the constraint
             -- named player_ledger_inflow_nonneg guards xp_in, a DIFFERENT
             -- column). Clamping it here would delete the first XP debit this
             -- game ever issues off a ranked surface. Security S-LR-1.
             sum(greatest(coalesce(l.xp, 0), 0)),
             sum(greatest(-coalesce(l.xp, 0), 0)),
             -- qty is SIGNED: negative when items leave the bag (a market list,
             -- a craft consuming reagents). Both directions are real movement and
             -- both are kept, mirroring the gold pair.
             sum(greatest(coalesce(l.qty, 0), 0)),
             sum(greatest(-coalesce(l.qty, 0), 0)),
             sum(greatest(coalesce(l.gems_in, 0), 0))
        from public.player_ledger l join doomed d on d.id = l.id and d.at = l.at
       group by 1,2,3,4
    on conflict (user_id, slot, month, kind) do update
      set n        = r.n        + excluded.n,
          gold_in  = r.gold_in  + excluded.gold_in,
          gold_out = r.gold_out + excluded.gold_out,
          xp_in    = r.xp_in    + excluded.xp_in,
          xp_out   = r.xp_out   + excluded.xp_out,
          qty_in   = r.qty_in   + excluded.qty_in,
          qty_out  = r.qty_out  + excluded.qty_out,
          gems_in  = r.gems_in  + excluded.gems_in
    returning 1
  )
  delete from public.player_ledger l
   using doomed d where l.id = d.id and l.at = d.at;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_ledger_prune(integer)
  from public, anon, authenticated, service_role;

-- ── §5 hr_apply — FIVE ANCHORED EDITS (RESTATEMENT-DEBT-ACK in the header) ──
-- Each anchor must match EXACTLY once or the block raises. A body that already
-- carries `v_wallet jsonb;` is this file's post-image: skipped.
do $$
declare
  v_def text; v_new text; v_n int;
  a1 text := $a$    v_new_gems := v_st.gems;
    if p_delta ? 'gems' then
      v_n := coalesce((p_delta->>'gems')::bigint, 0);
      if abs(v_n) > c_max_gem_delta then
        perform public.hr_reject('gem_clamp', jsonb_build_object('limit', c_max_gem_delta));
      end if;
      v_new_gems := v_st.gems + v_n;
      if v_new_gems < 0 then
        perform public.hr_reject('insufficient_gems',
                                 jsonb_build_object('have', v_st.gems, 'need', -v_n));
      end if;
    end if;
$a$;
  r1 text := $a$    -- ACCOUNT WALLET (2026-10-19-account-wallet.sql). Gems are the ACCOUNT's,
    -- in public.account_wallet, so v_new_gems is now the CREDIT this apply asks
    -- the wallet for: paid AFTER the ledger row by hr_wallet_credit under the
    -- account grant key 'apply:<journal.intent>' (once per account, the
    -- account's day cap). The engine never SPENDS gems — a spend is an RPC with
    -- its own catalogue — so a negative gem delta is refused.
    v_new_gems := 0;
    if p_delta ? 'gems' then
      v_n := coalesce((p_delta->>'gems')::bigint, 0);
      if abs(v_n) > c_max_gem_delta then
        perform public.hr_reject('gem_clamp', jsonb_build_object('limit', c_max_gem_delta));
      end if;
      if v_n < 0 then
        perform public.hr_reject('bad_delta', jsonb_build_object(
          'field', 'gems', 'why', 'the engine never spends gems'));
      end if;
      if v_n > 0 and coalesce(p_delta #>> '{journal,intent}', '') = '' then
        perform public.hr_reject('bad_delta', jsonb_build_object(
          'field', 'gems', 'why', 'a gem credit needs journal.intent, its account grant key'));
      end if;
      v_new_gems := v_n;
    end if;
$a$;
  a2 text := $a$           gems = v_new_gems,
$a$;
  a3 text := $a$       v_gold_in, v_xp_in, v_qty_in, v_gems_in,
       jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb));
$a$;
  r3 text := $a$       v_gold_in, v_xp_in, v_qty_in, 0,
       jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb));
    -- ACCOUNT WALLET: the credit, journalled by the wallet as its OWN kind='wallet'
    -- row. gems_in lives THERE (0 above), so the account's day budget counts a
    -- gem once; v_gems_in still pre-checked it at (4b).
    if v_new_gems > 0 then
      v_wallet := public.hr_wallet_credit(v_uid, v_slot, v_new_gems,
                    'apply:' || (p_delta #>> '{journal,intent}'), now() + interval '8 days');
    end if;
$a$;
  a4 text := $a$  v_new_gold bigint; v_new_gems bigint;
$a$;
  r4 text := $a$  v_new_gold bigint; v_new_gems bigint; v_wallet jsonb;
$a$;
  a5 text := $a$    v_out := public.hr_state_of(v_uid, v_slot);
$a$;
  r5 text := $a$    v_out := public.hr_state_of(v_uid, v_slot);
    -- What the wallet ACTUALLY paid (0 when another hero of the account already
    -- took this grant key), so no receipt can claim gems that did not land.
    if v_wallet is not null then
      v_out := v_out || jsonb_build_object('gems_paid', (v_wallet ->> 'paid')::bigint);
    end if;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('v_wallet jsonb;' in v_def) > 0 then
    raise notice 'account-wallet §5: hr_apply already pays gems through the wallet — patch skipped'; return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  if v_n <> 1 then raise exception 'account-wallet §5: hr_apply gem-block anchor matched % times', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a2, ''))) / length(a2);
  if v_n <> 1 then raise exception 'account-wallet §5: hr_apply gem-column anchor matched % times', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a3, ''))) / length(a3);
  if v_n <> 1 then raise exception 'account-wallet §5: hr_apply ledger anchor matched % times', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a4, ''))) / length(a4);
  if v_n <> 1 then raise exception 'account-wallet §5: hr_apply declare anchor matched % times', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a5, ''))) / length(a5);
  if v_n <> 1 then raise exception 'account-wallet §5: hr_apply envelope anchor matched % times', v_n; end if;
  v_new := replace(v_def, a1, r1);
  v_new := replace(v_new, a2, '');
  v_new := replace(v_new, a3, r3);
  v_new := replace(v_new, a4, r4);
  v_new := replace(v_new, a5, r5);
  execute v_new;
end $$;

-- ── §6 THE CARRY AND THE DROP — ONE STATEMENT, SO NOTHING WRITES BETWEEN ────
-- Every account's per-hero balances summed into its wallet ONCE, journalled as
-- one kind='wallet' row per account that held anything (gems_in 0: a carry is
-- not an inflow and must not eat the day cap), then the per-hero columns go.
-- `meta.carry` keeps the per-slot balances; the row is never pruned, because
-- hr_ledger_prune exempts kind='wallet' (§4), so the carry stays auditable.
do $$
declare v_n int; v_g bigint;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_state' and column_name = 'gems') then
    raise notice 'account-wallet §6: player_state.gems already gone — carry and drop skipped'; return;
  end if;
  execute $q$
    with per as (
      select user_id,
             sum(coalesce(gems, 0))::bigint          as gems,
             sum(coalesce(hearth_tokens, 0))::bigint as tokens,
             jsonb_object_agg(slot::text, jsonb_build_object('gems', coalesce(gems, 0),
                                                             'hearth_tokens', coalesce(hearth_tokens, 0))) as carry,
             min(slot) as first_slot
        from public.player_state
       group by user_id
    ), w as (
      insert into public.account_wallet as aw (user_id, gems, hearth_tokens, version, updated_at)
      select user_id, gems, tokens, 1, now() from per
      on conflict (user_id) do update
        set gems = aw.gems + excluded.gems,
            hearth_tokens = aw.hearth_tokens + excluded.hearth_tokens,
            version = aw.version + 1, updated_at = now()
      returning aw.user_id, aw.gems, aw.hearth_tokens, aw.version
    )
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    select per.user_id, per.first_slot, 'wallet', 'wallet_carry:2026-10-19', 0, 0, 0, 0, 0,
           jsonb_build_object('gems', per.gems, 'hearth_tokens', per.tokens, 'balance', w.gems,
                              'wallet_version', w.version, 'carry', per.carry)
      from per join w using (user_id)
     where per.gems <> 0 or per.tokens <> 0
  $q$;
  get diagnostics v_n = row_count;
  select coalesce(sum(gems), 0) into v_g from public.account_wallet;
  raise notice 'account-wallet §6: carried % account(s) with a balance; % gems now in wallets', v_n, v_g;
  alter table public.player_state drop column gems;
  alter table public.player_state drop column hearth_tokens;
end $$;


-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED AND ROLLED BACK ─────────────────
-- k = structure (ACLs, keys, columns, the writer census); v = behaviour, on a
-- probe account inside a subtransaction discarded by a sentinel raise (HR8AW),
-- followed by a leak check.
do $$
declare
  v        jsonb;
  v_uid    constant uuid := '000000a1-0000-4000-a000-00000000a11e';
  v_two    constant uuid := '000000a1-0000-4000-a000-00000000a12e';
  v_day    text := public.hr_utc_day_key(now());
  v_g      bigint; v_ver bigint; v_txt text;
  v_census text[];
  -- Every body that may name a gems identifier, and the column it means:
  c_gem_identifier_ok constant text[] := array[
    'hr_claim_goal__ungated',              -- v_cat.gems: hr_goal_rewards (catalogue)
    'hr_create_character',                 -- v_kit.gems: hr_start_kit (catalogue)
    'hr_goal_state__ungated',              -- r.gems: hr_goal_rewards (catalogue)
    'hr_state_of',                         -- v_w.gems: account_wallet (the projection)
    'hr_wallet_credit',                    -- account_wallet.gems (the choke point)
    'hr_wallet_debit',                     -- account_wallet.gems (the choke point)
    'world_event_absence_claim__ungated',  -- world_event_pledges.gems (the pledge record)
    'world_event_pledge_settle__ungated'   -- world_event_pledges.gems (the pledge record)
  ];
begin
  -- k1 THE CHOKE POINT IS OWNER-ONLY (the ACL itself, not has_function_privilege).
  if exists (select 1 from pg_proc p
              where p.oid in ('public.hr_wallet_ensure(uuid)'::regprocedure,
                              'public.hr_wallet_credit(uuid,integer,bigint,text,timestamp with time zone)'::regprocedure,
                              'public.hr_wallet_debit(uuid,integer,bigint,text,jsonb)'::regprocedure)
                and (p.proacl is null
                     or exists (select 1 from aclexplode(p.proacl) a where a.grantee <> p.proowner))) then
    raise exception 'account-wallet §8 k1: a wallet helper is executable by someone besides its owner'; end if;
  -- k1b THE RESTATED BODIES KEEP EXACTLY THE ACL THEY HAD (owner + the one role
  --     each already granted), so a restatement can neither open nor close a door.
  select string_agg(p.proname || '=' || coalesce((select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text)
                                                     from aclexplode(p.proacl) a where a.grantee <> p.proowner), ''), ';' order by p.proname)
    into v_txt
    from pg_proc p
   where p.oid in ('public.hr_buy_hero_slot__ungated(integer,integer,uuid)'::regprocedure,
                   'public.hr_buy_gem_unlock__ungated(text,integer,uuid)'::regprocedure,
                   'public.hr_claim_goal__ungated(text,boolean,integer,uuid)'::regprocedure,
                   'public.hr_claim_milestone__ungated(text,integer)'::regprocedure,
                   'public.hr_claim_rank__ungated(text,integer)'::regprocedure,
                   'public.raid_claim__ungated(text,uuid,text,integer)'::regprocedure,
                   'public.world_event_claim__ungated(text,integer)'::regprocedure,
                   'public.hr_create_character(integer)'::regprocedure,
                   'public.hr_state_of(uuid,integer)'::regprocedure,
                   'public.hr_day_budget_used(uuid,integer,timestamp with time zone)'::regprocedure,
                   'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure);
  if v_txt is distinct from 'hr_apply=hr_engine;hr_buy_gem_unlock__ungated=;hr_buy_hero_slot__ungated=;'
      || 'hr_claim_goal__ungated=;hr_claim_milestone__ungated=;hr_claim_rank__ungated=;'
      || 'hr_create_character=authenticated;hr_day_budget_used=;hr_state_of=hr_engine;'
      || 'raid_claim__ungated=;world_event_claim__ungated=' then
    raise exception 'account-wallet §8 k1b: a restated body''s ACL moved: %', v_txt; end if;

  -- k2 THE TABLES: RLS forced, zero policies, no client / engine / tick privilege.
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('account_wallet', 'account_gem_grants')) then
    raise exception 'account-wallet §8 k2: a policy exists on the wallet tables'; end if;
  if exists (select 1 from pg_class where oid in ('public.account_wallet'::regclass, 'public.account_gem_grants'::regclass)
              and not (relrowsecurity and relforcerowsecurity)) then
    raise exception 'account-wallet §8 k2: RLS is not forced on a wallet table'; end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name in ('account_wallet', 'account_gem_grants')
                and grantee in ('anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick', 'PUBLIC')) then
    raise exception 'account-wallet §8 k2: a client or engine role holds a privilege on a wallet table'; end if;

  -- k3 KEYED ON THE ACCOUNT: the wallet by user_id alone, the grant by
  --    (user_id, grant_key) — slot is recorded, never part of the key.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.account_wallet'::regclass and c.contype = 'p') is distinct from 'PRIMARY KEY (user_id)'
     or (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.account_gem_grants'::regclass and c.contype = 'p') is distinct from 'PRIMARY KEY (user_id, grant_key)' then
    raise exception 'account-wallet §8 k3: a wallet key is not the account'; end if;

  -- k4 THE PER-HERO COLUMNS ARE GONE.
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'player_state' and column_name in ('gems', 'hearth_tokens')) then
    raise exception 'account-wallet §8 k4: player_state still carries a gem or token column'; end if;

  -- k5 THE WRITER CENSUS. Comments and string literals stripped, then:
  --    (a) only the three helpers write the wallet tables;
  --    (b) a bare `gems` identifier appears only in bodies whose gem columns are
  --        NOT a player balance (catalogues, pledges, the wallet itself), each
  --        listed by name in c_gem_identifier_ok. A new body naming `gems` is red
  --        until it is classified here — PL/pgSQL binds columns at RUN time, so a
  --        leftover `v_st.gems` would pass every create and fail in a player's hands.
  select array_agg(p.proname::text order by p.proname) into v_census
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and regexp_replace(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
           '/\*.*?\*/', '', 'g'), '''([^'']|'''')*''', '''''', 'g')
         ~* '(update|insert\s+into)\s+(public\.)?(account_wallet|account_gem_grants)\M'
     and p.proname not in ('hr_wallet_ensure', 'hr_wallet_credit', 'hr_wallet_debit');
  if v_census is not null then
    raise exception 'account-wallet §8 k5(a): % write the wallet tables outside the choke point', v_census; end if;
  select array_agg(distinct p.proname::text order by p.proname::text) into v_census
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and regexp_replace(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
           '/\*.*?\*/', '', 'g'), '''([^'']|'''')*''', '''''', 'g')
         ~* '(^|[^a-z0-9_$])gems([^a-z0-9_]|$)';
  if v_census is distinct from c_gem_identifier_ok then
    raise exception 'account-wallet §8 k5(b): the bodies naming a gems identifier are %, expected % — classify the new one or route it through hr_wallet_*',
      v_census, c_gem_identifier_ok; end if;
  -- k5(c) THE LOCK RULE (Security C1). Every body that DEBITS the wallet takes
  --    the ACCOUNT advisory lock (uid:0) before its first hr_wallet_debit call:
  --    a spend's ownership check is account-wide, so a per-hero lock lets two
  --    heroes both read "not owned" and both pay. Read off the comment-stripped
  --    source (literals kept: the lock key IS a literal).
  select array_agg(p.proname::text order by p.proname) into v_census
    from pg_proc p,
         lateral (select regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '/\*.*?\*/', '', 'g') as s) c
   where p.pronamespace = 'public'::regnamespace
     and p.proname <> 'hr_wallet_debit'
     and strpos(c.s, 'hr_wallet_debit(') > 0
     and (strpos(c.s, 'pg_advisory_xact_lock(hashtextextended(v_uid::text || '':'' || ''0'', 0))') = 0
          or strpos(c.s, 'pg_advisory_xact_lock(hashtextextended(v_uid::text || '':'' || ''0'', 0))')
             > strpos(c.s, 'hr_wallet_debit('));
  if v_census is not null then
    raise exception 'account-wallet §8 k5(c): % debit the wallet without first taking the account lock (uid:0)', v_census; end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname <> 'hr_wallet_debit' and strpos(p.prosrc, 'hr_wallet_debit(') > 0) < 2 then
    raise exception 'account-wallet §8 k5(c): fewer than the two known debit callers were found — the census is blind'; end if;
  -- k7 THE WALLET JOURNAL IS NEVER PRUNED (Security F2): the prune's victim set
  --    excludes kind='wallet' (driven on a replay by tests/account-wallet.mjs
  --    W-PRUNE — never here, where a prune would touch real rows).
  if strpos(regexp_replace((select prosrc from pg_proc where oid = 'public.hr_ledger_prune(integer)'::regprocedure),
                           '--[^\n]*', '', 'g'), 'and kind <> ''wallet''') = 0 then
    raise exception 'account-wallet §8 k7: hr_ledger_prune would prune the wallet journal'; end if;

  begin
    insert into auth.users (id) values (v_uid), (v_two) on conflict (id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'account-wallet §8 v0: create hero A: %', v; end if;
    perform public.hr_wallet_credit(v_uid, 0, 600, 'aw:probe:seed', null);

    -- v3 A HERO-SLOT BUY DEBITS THE WALLET ONCE AND EVERY SLOT SEES IT.
    v := public.hr_buy_hero_slot__ungated(2, 0, '000000a1-0000-4000-a000-0000000000b1');
    if v->>'error' is distinct from 'requires_previous_slot' then
      raise exception 'account-wallet §8 v3: slot 2 before slot 1: %', v; end if;
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000a1-0000-4000-a000-0000000000b2');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gems')::bigint <> 400 then
      raise exception 'account-wallet §8 v3: slot 1 buy: %', v; end if;
    v := public.hr_buy_hero_slot__ungated(1, 0, '000000a1-0000-4000-a000-0000000000b2');
    if (select gems from public.account_wallet where user_id = v_uid) <> 400 then
      raise exception 'account-wallet §8 v3: a replayed buy debited twice'; end if;
    if (select count(*) from public.player_ledger where user_id = v_uid and kind = 'wallet'
         and intent = 'hero_slot_buy:1' and (meta->>'gems')::bigint = -200) <> 1 then
      raise exception 'account-wallet §8 v3: the debit is not ONE signed wallet row'; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'account-wallet §8 v3: create hero B: %', v; end if;
    if (select count(*) from public.account_wallet where user_id = v_uid) <> 1 then
      raise exception 'account-wallet §8 v3: two heroes did not share ONE wallet row'; end if;
    if (public.hr_state_of(v_uid, 0)->'state'->>'gems')::bigint <> 400
       or (public.hr_state_of(v_uid, 1)->'state'->>'gems')::bigint <> 400 then
      raise exception 'account-wallet §8 v3: the slots disagree on the balance (% / %)',
        public.hr_state_of(v_uid, 0)->'state'->>'gems', public.hr_state_of(v_uid, 1)->'state'->>'gems'; end if;
    -- v3c THE RESTATEMENT KEPT name-moderation's projection: `must_rename` is a
    --     top-level boolean on every slot's envelope (false for this account).
    if jsonb_typeof(public.hr_state_of(v_uid, 0)->'must_rename') is distinct from 'boolean'
       or jsonb_typeof(public.hr_state_of(v_uid, 1)->'must_rename') is distinct from 'boolean'
       or (public.hr_state_of(v_uid, 1)->>'must_rename')::boolean then
      raise exception 'account-wallet §8 v3c: hr_state_of lost or mis-projects must_rename (%)',
        public.hr_state_of(v_uid, 1)->'must_rename'; end if;
    update public.player_state set renown_high = greatest(coalesce(renown_high, 0), 5000) where user_id = v_uid;

    -- v1 A GEM GRANT CLAIMED ON HERO A PAYS NO GEMS ON HERO B (its gold still pays).
    v := public.hr_claim_rank__ungated('baron', 0);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gems')::int <> 25 then
      raise exception 'account-wallet §8 v1: baron on hero A: %', v; end if;
    v := public.hr_claim_rank__ungated('baron', 1);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gems')::int <> 0 or (v->>'gold')::bigint <> 5000 then
      raise exception 'account-wallet §8 v1: baron on hero B paid gems or no gold: %', v; end if;
    if (select gems from public.account_wallet where user_id = v_uid) <> 425 then
      raise exception 'account-wallet §8 v1: the wallet is % after one baron, expected 425',
        (select gems from public.account_wallet where user_id = v_uid); end if;
    if (select count(*) from public.account_gem_grants where user_id = v_uid and grant_key = 'rank:baron') <> 1 then
      raise exception 'account-wallet §8 v1: the rank grant key is not once per account'; end if;

    -- v2 THE ENGINE PATH: the same login intent on hero A then hero B pays once,
    --    and the engine cannot spend.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object('gems', 5,
           'journal', jsonb_build_object('kind', 'quest', 'intent', 'aw:probe:login:' || v_day)));
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gems_paid')::int <> 5 or (v->'state'->>'gems')::bigint <> 430 then
      raise exception 'account-wallet §8 v2: hr_apply credit on hero A: %', left(v::text, 400); end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 1;
    v := public.hr_apply(v_uid, 1, v_ver, gen_random_uuid(), jsonb_build_object('gems', 5,
           'journal', jsonb_build_object('kind', 'quest', 'intent', 'aw:probe:login:' || v_day)));
    if coalesce(v->>'ok', '') <> 'true' or (v->>'gems_paid')::int <> 0 or (v->'state'->>'gems')::bigint <> 430 then
      raise exception 'account-wallet §8 v2: hr_apply on hero B re-paid the grant: %', left(v::text, 400); end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 1;
    v := public.hr_apply(v_uid, 1, v_ver, gen_random_uuid(), jsonb_build_object('gems', -5,
           'journal', jsonb_build_object('kind', 'quest', 'intent', 'aw:probe:spend')));
    if v->>'error' is distinct from 'bad_delta' then
      raise exception 'account-wallet §8 v2: the engine spent gems: %', left(v::text, 400); end if;

    -- v3b AN UNAFFORDABLE BUY IS REFUSED BY THE WALLET AND MOVES NOTHING.
    v := public.hr_buy_hero_slot__ungated(2, 1, '000000a1-0000-4000-a000-0000000000b3');
    if v->>'error' is distinct from 'insufficient_gems' or (v->>'have')::bigint <> 430 then
      raise exception 'account-wallet §8 v3b: an unaffordable slot: %', v; end if;
    if (select gems from public.account_wallet where user_id = v_uid) <> 430 then
      raise exception 'account-wallet §8 v3b: a refused buy moved the wallet'; end if;

    -- v4 THE DAY CAP IS THE ACCOUNT'S: every slot reads one gem total (600 seed
    --    + 25 baron + 5 login), and a credit past it is refused on any hero.
    if (public.hr_day_budget_used(v_uid, 0)->>'gems')::bigint <> 630
       or (public.hr_day_budget_used(v_uid, 1)->>'gems')::bigint <> 630 then
      raise exception 'account-wallet §8 v4: the gem day budget is not account-wide (% / %)',
        public.hr_day_budget_used(v_uid, 0)->>'gems', public.hr_day_budget_used(v_uid, 1)->>'gems'; end if;
    begin
      perform public.hr_wallet_credit(v_uid, 1, (public.hr_day_budget_limits()->>'gems')::bigint - 629, 'aw:probe:cap', null);
      raise exception 'account-wallet §8 v4: a credit past the account''s day cap was paid';
    exception when sqlstate 'HR000' then
      get stacked diagnostics v_txt = message_text;
      if v_txt <> 'daily_budget' then raise exception 'account-wallet §8 v4: cap refused as %', v_txt; end if;
    end;

    -- v5 EVERY MOVEMENT IS JOURNALLED: the wallet equals the sum of its signed
    --    kind='wallet' rows, and no other kind carries meta.gems for this account.
    select coalesce(sum((meta->>'gems')::bigint), 0) into v_g from public.player_ledger
     where user_id = v_uid and kind = 'wallet';
    if v_g <> (select gems from public.account_wallet where user_id = v_uid) then
      raise exception 'account-wallet §8 v5: journal says %, wallet says %', v_g,
        (select gems from public.account_wallet where user_id = v_uid); end if;
    if exists (select 1 from public.player_ledger where user_id = v_uid and kind <> 'wallet' and meta ? 'gems') then
      raise exception 'account-wallet §8 v5: a non-wallet ledger row carries meta.gems (double count)'; end if;

    -- v6 ANOTHER ACCOUNT IS UNTOUCHED.
    perform set_config('request.jwt.claim.sub', v_two::text, true);
    v := public.hr_create_character(0);
    if (public.hr_state_of(v_two, 0)->'state'->>'gems')::bigint <> 0 then
      raise exception 'account-wallet §8 v6: a fresh account starts with gems'; end if;

    raise exception using errcode = 'HR8AW', message = 'account-wallet §8 complete — rolling back';
  exception when sqlstate 'HR8AW' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_ledger where user_id in (v_uid, v_two))
     or exists (select 1 from public.account_wallet where user_id in (v_uid, v_two))
     or exists (select 1 from public.account_gem_grants where user_id in (v_uid, v_two))
     or exists (select 1 from auth.users where id in (v_uid, v_two)) then
    raise exception 'account-wallet §8: a probe row leaked';
  end if;

  declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
  begin
    if jsonb_array_length(coalesce(v_gh->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_gh->'ungated_client_rpcs', '[]'::jsonb)) <> 0 then
      raise exception 'account-wallet §8 k6: grant hygiene: %', v_gh;
    end if;
  end;
  raise notice 'account-wallet §8: owner-only choke point, account-keyed tables, columns dropped, '
               'writer census, once-per-account grants (RPC + engine), one debit seen by every slot, '
               'account day cap, conservation — all green';
end $$;
