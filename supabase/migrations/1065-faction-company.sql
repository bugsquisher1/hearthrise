-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1065-faction-company.sql — THE SIDE BELONGS TO THE COMPANY: ONE SIDE, ONE STANDING AND ONE QUARTERMASTER FOR ALL
--   OF AN ACCOUNT'S HEROES (lane/factions-morrow-hills, game designer, 2026-11-23; docs/design/redesign/25-factions.md sections 2 and 6).
--
-- STATUS: supabase/migration-notes/1065-faction-company.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12), after 1065-faction-company-catalogue.generated.sql (hr_faction_stock,
--   the rule's company swap, hr_faction_piece_price). Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its
--   §4 self-check. 2027-05-27-arm-factions.sql (held) runs before this file in the order and reads nothing this file drops.
-- EDGE: none. The settle's one call of hr_faction_credit keeps its signature; only its body moves. CLIENT: none must land first: the
--   `factions` section keeps every key it had (standing per side, the swap, the pieces), now the company's, and gains each piece's kind
--   and price. The switch stays off (25 section 4: nothing a player sees until the Morrow Hills open).
--
-- ── THE DESIGN (25-factions.md) ──────────────────────────────────────────────
--   ONE SIDE FOR THE COMPANY (2.1): a company joins once, after ANY of its heroes has a server-counted kill of the rule's monster.
--   STANDING (2.3): each settled hero-minute on a ground paying the company's side adds to the company's total for that side; a hero is
--     clamped per UTC day (hr_faction_days, unchanged: per hero, per day). Kept per side, never spent, never lost on a swap.
--   THE SWAP (2.2): company hero-minutes on the new side's grounds (the rule's swap_ms, 40 h), a week's lock from joining or the last swap,
--     cancel loses the time. Credited by every hero's settle to the one company row.
--   THE QUARTERMASTER (2.4): a free open piece is CLAIMED (hr_faction_outfit_claim); a paid piece is BOUGHT (hr_faction_buy) at the server's
--     price, its wage hours at the company's TOP Level (hr_faction_piece_price; the designer's call: which hero presses never changes the
--     price), paid by the pressing hero through hr_apply. Once per company per piece. A closed piece (open false) is refused by both.
--     hr_faction_buy is DARK: no client role may run it until a paid piece opens (the hall's wall, mounts). §4 proves it on a probe.
--   LOOKS: hr_outfit_owned reads the COMPANY's claims, so a piece claimed by one hero dresses every hero of the company.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
--   hr_faction_companies       (user) -> faction, joined_at, changed_at (the lock's anchor), swap_to, swap_at, swap_ms.       NEW
--   hr_faction_company_standing (user, faction) -> ms. RAISE-ONLY (hr_faction_raise_only).                                   NEW
--   hr_faction_company_claims  (user, piece) -> faction, standing_ms and gold at the claim, the slot that pressed, claimed_at. NEW
--   hr_faction_members, hr_faction_standing, hr_faction_claims                                     DROPPED (replaced, not migrated: 25 section 6)
--   hr_faction_days, hr_faction_ledger                                    KEPT: a hero's day clamp; the journal (slot = the hero that pressed)
--   hr_faction_company_lock(user)       NEW, internal: the company's advisory key. Always taken AFTER the hero's lock (hr_hunt_lock).
--   hr_faction_top_level(user)          NEW, internal: the company's highest hero Level (the paid pieces' price step).
--   hr_faction_view(user, slot)         RESTATED: { faction, can_join, joined_at, swap, swap_ready_at, standing, today_ms (this hero),
--                                       day_cap_ms, pieces: [{ id, faction, kind, need_ms, held, price }] } over OPEN pieces only.
--   hr_faction_credit(user, slot, hunt, from, to)  RESTATED: the company's side and swap; the hero's day clamp; the company's totals.
--   hr_faction_locked(...)              RESTATED: the hero's lock, then the company's key (every verb is one order per company).
--   hr_faction_join / _swap_start / _swap_finish / _swap_cancel / _outfit_claim   RESTATED on the company, unchanged signatures and grants.
--     New refusals: piece_closed (a closed piece), piece_priced (a paid piece is bought, not claimed).
--   hr_faction_buy(p_slot, p_piece, p_price, p_idem) NEW, MONEY, DARK: refuses bad_intent, unknown_piece, piece_closed, piece_free,
--     piece_owned, standing_short, quote_changed (carrying the section), insufficient_gold (hr_apply's).
--   hr_outfit_owned(user, slot)         RESTATED: a faction look reads the company's claims.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
--   Every verb takes the pressing hero's lock (hr_hunt_lock), reads its key again under it, then takes the company key; the settle's credit
--   holds its hero's lock and takes the company key only on a paying ground. One order everywhere (hero, then company), so two heroes'
--   settles and a verb of a third are serial on the company row, never deadlocked. The journal's (user, idem) is unique. A paid buy ends
--   in hr_apply, whose replay answers a second press of one key; a NEW key re-reads the claim (piece_owned) and never charges twice.
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
--   No verb takes a number but hr_faction_buy's p_price, compared for equality with the server's own price and never used past it.
--   Standing is credited only inside the settle on a catalogue ground, clamped per hero per day; the company's total is a sum of clamped
--   hero credits, so four heroes earn four heroes' time and no more. A side gives no power (ledger row 17): no verb or read here feeds a
--   stat, an XP or a drop. The only value that moves is gold OUT (a sink), once per company per paid piece, and nothing returns it.
--   ON THE PRE-EA SECURITY LIST (13-security-list.md N-10), with the week's close when the social layer ships it.
--
-- ── COST (100x players: 8,000 heroes, ~2,000 companies) ─────────────────────
--   Per settle of ANY hunt: one primary-key probe of hr_faction_grounds (as before). On a paying ground: the company key, one company row,
--   the hero's day rows (as before), one upsert of the company standing (or the swap time). Rows: companies 2,000, standing 4,000, claims
--   at most 10 a company; the day rows as before (one per hero per hunting day per side). Per envelope: the section reads one company row,
--   two standing rows, the open stock (6 rows) and the claims; the Krell read runs only for a company with no side.
--
-- REVERSIBILITY: re-apply 2027-04-22-faction-standing.sql's tables and bodies, 2027-05-28-faction-swap-cancel.sql's verb,
--   2027-04-23-faction-section.sql's door and 2027-05-19-faction-outfit-path.sql's hr_outfit_owned; drop hr_faction_buy, the two helpers and
--   the three company tables. Company rows are not split back into heroes (no player value: looks only, and the gold of a paid piece).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_faction_stock') is null or to_regclass('public.hr_faction_rule') is null or to_regclass('public.hr_faction_grounds') is null
     or to_regprocedure('public.hr_faction_piece_price(text,integer)') is null then
    raise exception 'PRECONDITION: apply 1065-faction-company-catalogue.generated.sql first'; end if;
  if to_regclass('public.hr_faction_days') is null or to_regclass('public.hr_faction_ledger') is null
     or to_regprocedure('public.hr_faction_raise_only()') is null or to_regprocedure('public.hr_faction_section(uuid,integer)') is null
     or to_regprocedure('public.hr_faction_swap_cancel(integer,uuid)') is null then
    raise exception 'PRECONDITION: the faction files (2027-04-22-faction-standing.sql to 2027-05-28-faction-swap-cancel.sql) first'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_title_kills(uuid,integer,text[])') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null
     or to_regprocedure('public.hr_premium_active(uuid,integer,timestamptz)') is null or to_regclass('public.hr_outfits') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
end $mig$;

-- ── §1 THE COMPANY'S TABLES ──────────────────────────────────────────────────
create table if not exists public.hr_faction_companies (
  user_id    uuid not null primary key references auth.users (id) on delete cascade,
  faction    text not null references public.hr_factions (faction_id),
  joined_at  timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  swap_to    text references public.hr_factions (faction_id),
  swap_at    timestamptz,
  swap_ms    bigint not null default 0 check (swap_ms >= 0),
  constraint hr_faction_companies_swap_ck check ((swap_to is null) = (swap_at is null) and swap_to is distinct from faction
                                                 and (swap_to is not null or swap_ms = 0))
);
create table if not exists public.hr_faction_company_standing (
  user_id    uuid not null references auth.users (id) on delete cascade,
  faction    text not null references public.hr_factions (faction_id),
  ms         bigint not null default 0 check (ms >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, faction)
);
create table if not exists public.hr_faction_company_claims (
  user_id     uuid not null references auth.users (id) on delete cascade,
  piece_id    text not null check (piece_id ~ '^[a-z0-9_]{1,32}$'),
  faction     text not null,
  standing_ms bigint not null check (standing_ms >= 0),
  gold        bigint not null default 0 check (gold >= 0),
  slot        int  not null,
  claimed_at  timestamptz not null default now(),
  primary key (user_id, piece_id)
);
do $$
declare t text;
begin
  foreach t in array array['hr_faction_companies', 'hr_faction_company_standing', 'hr_faction_company_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
comment on table public.hr_faction_companies is '1065-faction-company.sql: a company''s side and its open swap (25-factions.md 2.1, 2.2). Written only by the faction verbs and the settle''s credit (swap time). RLS on, no policy, no client grant.';
comment on table public.hr_faction_company_standing is '1065-faction-company.sql: a company''s standing per side, in ms of settled hero hunting time. RAISE-ONLY. Written only by hr_faction_credit.';
comment on table public.hr_faction_company_claims is '1065-faction-company.sql: the pieces a company claimed or bought, once each, and the hero who pressed. Written only by hr_faction_outfit_claim and hr_faction_buy.';
drop trigger if exists hr_faction_company_standing_raise_only on public.hr_faction_company_standing;
create trigger hr_faction_company_standing_raise_only before update on public.hr_faction_company_standing
  for each row execute function public.hr_faction_raise_only();

alter table public.hr_faction_ledger drop constraint if exists hr_faction_ledger_kind_check;
alter table public.hr_faction_ledger add constraint hr_faction_ledger_kind_check
  check (kind in ('join', 'swap_start', 'swap_finish', 'claim', 'swap_cancel', 'buy'));

-- ── §2 THE HELPERS ───────────────────────────────────────────────────────────
create or replace function public.hr_faction_company_lock(p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  -- FACTION-COMPANY (1065-faction-company.sql): the company's key, always after the hero's lock.
  perform pg_advisory_xact_lock(hashtextextended('hr_faction:' || p_user::text, 0));
end $fn$;

create or replace function public.hr_faction_top_level(p_user uuid)
returns int language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  -- FACTION-COMPANY (1065-faction-company.sql): the company's highest hero Level, the step a company piece is priced at.
  return greatest(1, coalesce((select max(public.hr_level_of(p_user, ps.slot)) from public.player_state ps where ps.user_id = p_user), 1));
end $fn$;
revoke all on function public.hr_faction_company_lock(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hr_faction_top_level(uuid) from public, anon, authenticated, service_role;

-- ── §3 THE READ ──────────────────────────────────────────────────────────────
create or replace function public.hr_faction_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare r public.hr_faction_rule%rowtype; m public.hr_faction_companies%rowtype; v_day date := (now() at time zone 'UTC')::date;
  v_top int;
begin
  -- FACTION-COMPANY (1065-faction-company.sql): the company's side, swap, standing and pieces; today's clamp is this hero's.
  select * into r from public.hr_faction_rule where id;
  if not found then return null; end if;
  select * into m from public.hr_faction_companies x where x.user_id = p_user;
  v_top := public.hr_faction_top_level(p_user);
  return jsonb_build_object(
    'faction', m.faction,
    'can_join', case when m.faction is not null then false
                     else exists (select 1 from public.player_state ps where ps.user_id = p_user
                                   and public.hr_title_kills(p_user, ps.slot, array[r.join_monster]) > 0) end,
    'joined_at', m.joined_at,
    'swap', case when m.swap_to is null then null else jsonb_build_object('to', m.swap_to, 'started_at', m.swap_at, 'ms', m.swap_ms, 'need_ms', r.swap_ms) end,
    'swap_ready_at', case when m.faction is null then null else m.changed_at + make_interval(secs => r.cooldown_ms / 1000.0) end,
    'standing', (select coalesce(jsonb_object_agg(f.faction_id, coalesce(s.ms, 0) order by f.ord), '{}'::jsonb)
                   from public.hr_factions f left join public.hr_faction_company_standing s on s.user_id = p_user and s.faction = f.faction_id),
    'today_ms', (select coalesce(sum(d.ms + d.swap_ms), 0) from public.hr_faction_days d where d.user_id = p_user and d.slot = p_slot and d.day = v_day),
    'day_cap_ms', r.day_cap_ms,
    'pieces', (select coalesce(jsonb_agg(jsonb_build_object('id', o.piece_id, 'faction', o.faction, 'kind', o.kind, 'need_ms', o.need_ms,
                                                            'held', exists (select 1 from public.hr_faction_company_claims c
                                                                             where c.user_id = p_user and c.piece_id = o.piece_id),
                                                            'price', public.hr_faction_piece_price(o.piece_id, v_top))
                                         order by o.ord), '[]'::jsonb)
                 from public.hr_faction_stock o where o.open));
end $fn$;
revoke execute on function public.hr_faction_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §4a THE CREDIT (the settle's, never a client's) ──────────────────────────
create or replace function public.hr_faction_credit(p_user uuid, p_slot int, p_hunt text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_side text; m public.hr_faction_companies%rowtype; r public.hr_faction_rule%rowtype; v_swap boolean;
  v_a timestamptz; v_b timestamptz; v_day date; v_ms bigint; v_used bigint; v_take bigint; v_room bigint; v_total bigint := 0;
begin
  -- THE COMMON CASE, ONE PRIMARY-KEY PROBE: a ground that pays nobody.
  select g.faction into v_side from public.hr_faction_grounds g where g.hunt_id = p_hunt;
  if v_side is null or p_from is null or p_to is null or p_to <= p_from then return null; end if;
  -- FACTION-COMPANY (1065-faction-company.sql): the company's side, under its key (the settle already holds this hero's lock).
  perform public.hr_faction_company_lock(p_user);
  select * into m from public.hr_faction_companies x where x.user_id = p_user;
  if not found then return null; end if;
  if m.faction = v_side then v_swap := false;
  elsif m.swap_to = v_side then v_swap := true;
  else return null; end if;
  select * into r from public.hr_faction_rule where id;
  if not found then return null; end if;
  v_room := case when v_swap then greatest(0, r.swap_ms - m.swap_ms) else null end;
  v_a := p_from;
  while v_a < p_to and (v_room is null or v_total < v_room) loop
    v_day := (v_a at time zone 'UTC')::date;
    v_b := least(p_to, (v_day + 1)::timestamp at time zone 'UTC');
    v_ms := floor(extract(epoch from (v_b - v_a)) * 1000)::bigint;
    -- THE HERO'S DAY: one hero's standing and swap time together, whichever side, never past the rule's ceiling.
    select coalesce(sum(d.ms + d.swap_ms), 0) into v_used from public.hr_faction_days d
     where d.user_id = p_user and d.slot = p_slot and d.day = v_day;
    v_take := greatest(0, least(v_ms, r.day_cap_ms - v_used, coalesce(v_room - v_total, v_ms)));
    if v_take > 0 then
      insert into public.hr_faction_days as d (user_id, slot, day, faction, ms, swap_ms)
        values (p_user, p_slot, v_day, v_side, case when v_swap then 0 else v_take end, case when v_swap then v_take else 0 end)
        on conflict (user_id, slot, day, faction) do update set ms = d.ms + excluded.ms, swap_ms = d.swap_ms + excluded.swap_ms;
      v_total := v_total + v_take;
    end if;
    v_a := v_b;
  end loop;
  if v_total = 0 then return jsonb_build_object('side', v_side, 'swap', v_swap, 'ms', 0); end if;
  if v_swap then
    update public.hr_faction_companies set swap_ms = swap_ms + v_total where user_id = p_user;
  else
    insert into public.hr_faction_company_standing as s (user_id, faction, ms, updated_at) values (p_user, v_side, v_total, now())
      on conflict (user_id, faction) do update set ms = s.ms + excluded.ms, updated_at = excluded.updated_at;
  end if;
  return jsonb_build_object('side', v_side, 'swap', v_swap, 'ms', v_total);
end $fn$;
revoke execute on function public.hr_faction_credit(uuid, int, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- ── §4b THE DOOR: the hero's lock, the key under it, the switch, then the company's key ──
create or replace function public.hr_faction_locked(p_verb text, p_uid uuid, p_slot int, p_idem uuid, p_intent text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_r jsonb;
begin
  perform public.hr_hunt_lock(p_uid, p_slot);
  -- THE KEY UNDER THE LOCK: a second press of one key that waited here answers the first's receipt.
  v_r := public.hr_intent_replay(p_uid, p_slot, p_idem, p_intent);
  if v_r is not null then return public.hr_note_rejection(p_verb, p_slot, v_r); end if;
  if not exists (select 1 from public.player_state ps where ps.user_id = p_uid and ps.slot = p_slot) then
    return public.hr_note_rejection(p_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- FEATURE-SWITCH: the factions are closed to an account the `factions` switch is off for (2027-04-23-faction-section.sql).
  if not public.hr_feature_on('factions', p_uid) then
    return public.hr_note_rejection(p_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  if not exists (select 1 from public.hr_faction_rule where id) then
    return public.hr_note_rejection(p_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  -- FACTION-COMPANY (1065-faction-company.sql): the company's key, after the hero's lock, so every verb is one order per company.
  perform public.hr_faction_company_lock(p_uid);
  return null;
end $fn$;
revoke execute on function public.hr_faction_locked(text, uuid, int, uuid, text) from public, anon, authenticated, service_role;

-- ── §4c THE VERBS (signatures, grants and baseline rows unchanged; bodies on the company) ──
create or replace function public.hr_faction_join(p_slot int, p_faction text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_join';
  v_uid uuid := auth.uid(); v_intent text := c_verb || ':' || coalesce(left(p_faction, 32), '-'); v_r jsonb; v_monster text; v_kills bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return v_r; end if;
  if p_faction is null or not exists (select 1 from public.hr_factions f where f.faction_id = p_faction) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_faction')); end if;
  if exists (select 1 from public.hr_faction_companies m where m.user_id = v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_joined')); end if;
  -- KRELL FIRST: ANY hero of the company, its own server-counted kills of the rule's monster, never a number the caller sends.
  select join_monster into v_monster from public.hr_faction_rule where id;
  select coalesce(max(public.hr_title_kills(v_uid, ps.slot, array[v_monster])), 0) into v_kills
    from public.player_state ps where ps.user_id = v_uid;
  if v_kills < 1 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'join_locked', 'monster', v_monster, 'kills', v_kills)); end if;
  insert into public.hr_faction_companies (user_id, faction, joined_at, changed_at) values (v_uid, p_faction, now(), now());
  return public.hr_faction_done(v_uid, p_slot, p_idem, v_intent, 'join', p_faction, null,
    coalesce((select s.ms from public.hr_faction_company_standing s where s.user_id = v_uid and s.faction = p_faction), 0), null);
end $fn$;

create or replace function public.hr_faction_swap_start(p_slot int, p_faction text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_swap_start';
  v_uid uuid := auth.uid(); v_intent text := c_verb || ':' || coalesce(left(p_faction, 32), '-'); v_r jsonb; m public.hr_faction_companies%rowtype;
  v_ready timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return v_r; end if;
  select * into m from public.hr_faction_companies x where x.user_id = v_uid;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_member')); end if;
  if p_faction is null or not exists (select 1 from public.hr_factions f where f.faction_id = p_faction) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_faction')); end if;
  if p_faction = m.faction then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'same_faction')); end if;
  if m.swap_to is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'swap_open', 'to', m.swap_to)); end if;
  -- THE WEEK: from the company's last change of side (its join or its last finished swap), on the server's clock.
  select m.changed_at + make_interval(secs => r.cooldown_ms / 1000.0) into v_ready from public.hr_faction_rule r where r.id;
  if now() < v_ready then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'swap_cooldown', 'ready_at', v_ready)); end if;
  update public.hr_faction_companies set swap_to = p_faction, swap_at = now(), swap_ms = 0 where user_id = v_uid;
  return public.hr_faction_done(v_uid, p_slot, p_idem, v_intent, 'swap_start', p_faction, null, null, 0);
end $fn$;

create or replace function public.hr_faction_swap_finish(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_swap_finish';
  v_uid uuid := auth.uid(); v_r jsonb; m public.hr_faction_companies%rowtype; v_need bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return v_r; end if;
  select * into m from public.hr_faction_companies x where x.user_id = v_uid;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_member')); end if;
  if m.swap_to is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_swap')); end if;
  select swap_ms into v_need from public.hr_faction_rule where id;
  if m.swap_ms < v_need then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'swap_short', 'need_ms', v_need, 'have_ms', m.swap_ms)); end if;
  update public.hr_faction_companies set faction = m.swap_to, changed_at = now(), swap_to = null, swap_at = null, swap_ms = 0
   where user_id = v_uid;
  return public.hr_faction_done(v_uid, p_slot, p_idem, c_verb, 'swap_finish', m.swap_to, null, null, m.swap_ms);
end $fn$;

create or replace function public.hr_faction_swap_cancel(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_swap_cancel';
  v_uid uuid := auth.uid(); v_r jsonb; m public.hr_faction_companies%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return v_r; end if;
  select * into m from public.hr_faction_companies x where x.user_id = v_uid;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_member')); end if;
  if m.swap_to is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_swap')); end if;
  -- THE SWAP GOES, ITS TIME WITH IT; the side and changed_at (the week's start) stay as they were.
  update public.hr_faction_companies set swap_to = null, swap_at = null, swap_ms = 0 where user_id = v_uid;
  return public.hr_faction_done(v_uid, p_slot, p_idem, c_verb, 'swap_cancel', m.swap_to, null, null, m.swap_ms);
end $fn$;

create or replace function public.hr_faction_outfit_claim(p_slot int, p_piece text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_outfit_claim';
  v_uid uuid := auth.uid(); v_intent text := c_verb || ':' || coalesce(left(p_piece, 32), '-'); v_r jsonb; o public.hr_faction_stock%rowtype;
  v_have bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return v_r; end if;
  select * into o from public.hr_faction_stock x where x.piece_id = p_piece;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_piece')); end if;
  if not o.open then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'piece_closed', 'piece', p_piece)); end if;
  if o.wage_hours_pm is not null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'piece_priced', 'piece', p_piece)); end if;
  if exists (select 1 from public.hr_faction_company_claims c where c.user_id = v_uid and c.piece_id = p_piece) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'piece_owned', 'piece', p_piece)); end if;
  -- THE COMPANY'S STANDING on the piece's own side, kept across swaps: a company that earned both sides may own both.
  v_have := coalesce((select s.ms from public.hr_faction_company_standing s where s.user_id = v_uid and s.faction = o.faction), 0);
  if v_have < o.need_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'standing_short', 'piece', p_piece,
      'need_ms', o.need_ms, 'have_ms', v_have)); end if;
  insert into public.hr_faction_company_claims (user_id, piece_id, faction, standing_ms, gold, slot) values (v_uid, p_piece, o.faction, v_have, 0, p_slot);
  return public.hr_faction_done(v_uid, p_slot, p_idem, v_intent, 'claim', o.faction, p_piece, v_have, null);
end $fn$;

-- THE PAID PIECE: a gold sink, priced by the server at the company's top Level, paid by the pressing hero. DARK (no client role).
create or replace function public.hr_faction_buy(p_slot int, p_piece text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'faction_buy';
  v_uid uuid := auth.uid(); v_intent text := c_verb || ':' || coalesce(left(p_piece, 32), '-'); v_r jsonb; o public.hr_faction_stock%rowtype;
  v_have bigint; v_ver bigint; v_top int; v_price bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_faction_locked(c_verb, v_uid, p_slot, p_idem, v_intent);
  if v_r is not null then return v_r; end if;
  select * into o from public.hr_faction_stock x where x.piece_id = p_piece;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_piece')); end if;
  if not o.open then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'piece_closed', 'piece', p_piece)); end if;
  if o.wage_hours_pm is null then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'piece_free', 'piece', p_piece)); end if;
  if exists (select 1 from public.hr_faction_company_claims c where c.user_id = v_uid and c.piece_id = p_piece) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'piece_owned', 'piece', p_piece)); end if;
  v_have := coalesce((select s.ms from public.hr_faction_company_standing s where s.user_id = v_uid and s.faction = o.faction), 0);
  if v_have < o.need_ms then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'standing_short', 'piece', p_piece,
      'need_ms', o.need_ms, 'have_ms', v_have)); end if;
  -- THE SERVER'S PRICE: the piece's wage hours at the company's top Level, never the caller's number past this equality.
  v_top := public.hr_faction_top_level(v_uid);
  v_price := public.hr_faction_piece_price(p_piece, v_top);
  if v_price is distinct from p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'price', v_price,
      'faction', public.hr_faction_view(v_uid, p_slot))); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('gold', -v_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_intent,
                                         'meta', jsonb_build_object('reason', c_verb, 'piece', p_piece, 'level', v_top))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false)); end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  insert into public.hr_faction_company_claims (user_id, piece_id, faction, standing_ms, gold, slot) values (v_uid, p_piece, o.faction, v_have, v_price, p_slot);
  insert into public.hr_faction_ledger (user_id, slot, kind, faction, piece_id, standing_ms, swap_ms, idem)
    values (v_uid, p_slot, 'buy', o.faction, p_piece, v_have, null, p_idem);
  return jsonb_build_object('ok', true, 'gold', -v_price, 'faction', public.hr_faction_view(v_uid, p_slot));
end $fn$;
revoke all on function public.hr_faction_buy(int, text, bigint, uuid) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_faction_buy(int, text, bigint, uuid) from hr_engine;
  end if;
end $$;

-- ── §5 WHO OWNS AN OUTFIT: a faction look reads the COMPANY's claims ─────────
create or replace function public.hr_outfit_owned(p_user uuid, p_slot integer)
 returns text[]
 language plpgsql
 stable
 set search_path = public, pg_catalog
as $plc$
-- SWEEPS-COAT (2027-04-30-sweeps-coat.sql): a bundle outfit is the hero's only once it used the bundle. plpgsql, planned once a backend
-- (2027-02-10-settle-plan-cache.generated.sql's reason).
-- FACTION-OUTFIT-PATH (2027-05-19-faction-outfit-path.sql): a faction look is the hero's while it holds every piece the look names.
-- FACTION-COMPANY (1065-faction-company.sql): the pieces are the COMPANY's, so one claim dresses every hero of the account.
#variable_conflict use_column
declare
  v_held text[];
begin
  -- THE COMPANY'S CLAIMS, read once (the primary key's prefix): never taken back, so a swap keeps every look they own
  select coalesce(array_agg(c.piece_id), '{}') into v_held
    from public.hr_faction_company_claims c where c.user_id = p_user;
  return (select coalesce(array_agg(o.outfit_id order by o.sort), '{}')
            from public.hr_outfits o
           where case when o.bundle is not null
                      then exists (select 1 from public.player_cosmetics c
                                    where c.user_id = p_user and c.slot = p_slot and c.kind = 'outfit' and c.code = o.outfit_id)
                      when o.pieces is not null
                      then o.pieces <@ v_held
                      else not o.premium or public.hr_premium_active(p_user, p_slot, now()) end);
end
$plc$;
revoke all on function public.hr_outfit_owned(uuid, integer) from public, anon, authenticated, service_role;

-- ── §6 THE HERO'S TABLES GO (replaced, not migrated: 25 section 6) ────────────
drop table if exists public.hr_faction_claims;
drop table if exists public.hr_faction_standing;
drop table if exists public.hr_faction_members;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) the shape: the three company tables RLS on with no policy and no client grant, the hero tables gone, no body names them
-- (b) ONE COMPANY, TWO HEROES: hero 1's Krell kill lets hero 0 join; a second join (either hero) is already_joined
-- (c) the credit: hero 1 settles 3 h on a side's fixture ground, hero 0 2 h; the company's standing is 5 h, each hero's day row its own;
--     a window counted twice stops at the hero's day ceiling; the other side's ground pays nothing
-- (d) the quartermaster: a free open piece is claimed by hero 0 and dresses hero 1 (hr_outfit_owned); again piece_owned; a closed piece
--     piece_closed; a paid piece claimed piece_priced; short standing standing_short
-- (e) the buy (on a probe that opens a paid piece): quote_changed with the server's price, then bought at the company's TOP Level (hero 1's,
--     the higher) by hero 0: gold down by exactly that, one claim, one buy row; again piece_owned; a free piece piece_free
-- (f) the swap on the company: start (past the lock), hero 1's settle on the new side pays swap time to the company, finish at the need
-- (g) the grants: the five verbs authenticated as before, hr_faction_buy no client role (DARK), helpers internal, grant hygiene
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000fac71065';
  k   constant text := '000000c0-0000-4000-b000-fac71065';
  r public.hr_faction_rule%rowtype; v_a text; v_b text; v_hunt text; v_hunt_b text; v jsonb; v_scope text; v_free text;
  v_paid text; v_price bigint; v_gold0 bigint; v_gold1 bigint; v_t timestamptz := date_trunc('day', now()) + interval '1 hour'; v_role text;
  v_sig text; v_lv1 int;
begin
  -- (a)
  if to_regclass('public.hr_faction_members') is not null or to_regclass('public.hr_faction_standing') is not null
     or to_regclass('public.hr_faction_claims') is not null then
    raise exception 'faction-company §7(a): a hero table survived'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and p.prosrc ~ 'hr_faction_(members|standing|claims)\M') then
    raise exception 'faction-company §7(a): a body still names a dropped hero table'; end if;
  foreach v_sig in array array['hr_faction_companies', 'hr_faction_company_standing', 'hr_faction_company_claims'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_sig)::regclass)
       or exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_sig) then
      raise exception 'faction-company §7(a): % is not RLS-on with no policy', v_sig; end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(v_role, 'public.' || v_sig, 'select,insert,update,delete') then
        raise exception 'faction-company §7(a): % holds a privilege on %', v_role, v_sig; end if;
    end loop;
  end loop;

  select * into r from public.hr_faction_rule where id;
  select faction_id into v_a from public.hr_factions order by ord limit 1;
  select faction_id into v_b from public.hr_factions order by ord offset 1 limit 1;
  select piece_id into v_free from public.hr_faction_stock where faction = v_a and open and wage_hours_pm is null order by need_ms limit 1;
  select piece_id into v_paid from public.hr_faction_stock where faction = v_a and wage_hours_pm is not null order by need_ms limit 1;
  select hunt_id into v_hunt from public.hr_hunts order by hunt_id limit 1;
  select hunt_id into v_hunt_b from public.hr_hunts order by hunt_id offset 1 limit 1;
  select scope into v_scope from public.hr_feature_switches where switch_id = 'factions';
  if r.id is null or v_a is null or v_b is null or v_free is null or v_paid is null or v_hunt is null or v_hunt_b is null or v_scope is null then
    raise exception 'faction-company §7: the catalogue, a hunt or the switch is not there to probe with'; end if;
  begin
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'factions';
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Company') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'faction-company §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-company §7: hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-company §7: hr_create_character(1) refused: %', v; end if;

    -- (b) hero 1 killed Krell, hero 0 joins for the company
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_join(0, v_a, (k || '0001')::uuid);
    if v->>'error' is distinct from 'join_locked' then raise exception 'faction-company §7(b): a join before any Krell kill answered %', v; end if;
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values (v_u, 1, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now());
    if (public.hr_faction_view(v_u, 0)->>'can_join')::boolean is not true then
      raise exception 'faction-company §7(b): hero 1''s Krell kill does not open joining for hero 0: %', public.hr_faction_view(v_u, 0); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_join(0, v_a, (k || '0002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'faction'->>'faction' is distinct from v_a then raise exception 'faction-company §7(b): the join answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_join(1, v_b, (k || '0003')::uuid);
    if v->>'error' is distinct from 'already_joined' then raise exception 'faction-company §7(b): hero 1''s second join answered %', v; end if;
    if public.hr_faction_view(v_u, 1)->>'faction' is distinct from v_a then raise exception 'faction-company §7(b): hero 1 does not see the company''s side'; end if;

    -- (c) the credit
    delete from public.hr_faction_grounds where hunt_id in (v_hunt, v_hunt_b);
    insert into public.hr_faction_grounds (hunt_id, faction) values (v_hunt, v_a), (v_hunt_b, v_b);
    perform public.hr_faction_credit(v_u, 1, v_hunt, v_t, v_t + interval '3 hours');
    perform public.hr_faction_credit(v_u, 0, v_hunt, v_t, v_t + interval '2 hours');
    perform public.hr_faction_credit(v_u, 0, v_hunt_b, v_t, v_t + interval '2 hours');
    if (select ms from public.hr_faction_company_standing where user_id = v_u and faction = v_a) <> 5 * 3600000
       or exists (select 1 from public.hr_faction_company_standing where user_id = v_u and faction = v_b) then
      raise exception 'faction-company §7(c): the company''s standing reads %', public.hr_faction_view(v_u, 0)->'standing'; end if;
    if (select ms from public.hr_faction_days where user_id = v_u and slot = 1 and faction = v_a) <> 3 * 3600000
       or (select ms from public.hr_faction_days where user_id = v_u and slot = 0 and faction = v_a) <> 2 * 3600000 then
      raise exception 'faction-company §7(c): a hero''s day row is not its own'; end if;
    -- a window counted twice, and again, stops at hero 0's day ceiling (whole-day windows from the day's start)
    perform public.hr_faction_credit(v_u, 0, v_hunt, date_trunc('day', v_t), date_trunc('day', v_t) + interval '23 hours 59 minutes');
    perform public.hr_faction_credit(v_u, 0, v_hunt, date_trunc('day', v_t), date_trunc('day', v_t) + interval '23 hours 59 minutes');
    if (select sum(ms + swap_ms) from public.hr_faction_days where user_id = v_u and slot = 0 and day = (v_t at time zone 'UTC')::date) <> r.day_cap_ms then
      raise exception 'faction-company §7(c): hero 0''s day passed its ceiling'; end if;

    -- (d) the quartermaster: claims
    update public.hr_faction_company_standing set ms = greatest(ms, (select max(need_ms) from public.hr_faction_stock where faction = v_a))
     where user_id = v_u and faction = v_a;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_outfit_claim(0, v_free, (k || '0004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-company §7(d): the claim answered %', v; end if;
    if exists (select 1 from public.hr_outfits o where o.pieces is not null and o.pieces <@ array[v_free])
       and not exists (select 1 from public.hr_outfits o where o.pieces <@ array[v_free] and o.outfit_id = any (public.hr_outfit_owned(v_u, 1))) then
      raise exception 'faction-company §7(d): hero 0''s claim does not dress hero 1'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_outfit_claim(1, v_free, (k || '0005')::uuid);
    if v->>'error' is distinct from 'piece_owned' then raise exception 'faction-company §7(d): hero 1 claimed the company''s piece again: %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_outfit_claim(0, v_paid, (k || '0006')::uuid);
    if v->>'error' is distinct from 'piece_closed' then raise exception 'faction-company §7(d): a closed piece answered %', v; end if;
    if exists (select 1 from public.hr_faction_stock where open is false and piece_id = v_paid) then
      update public.hr_faction_stock set open = true where piece_id = v_paid;
    end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_outfit_claim(0, v_paid, (k || '0007')::uuid);
    if v->>'error' is distinct from 'piece_priced' then raise exception 'faction-company §7(d): a paid piece claimed answered %', v; end if;
    if (select count(*) from public.hr_faction_company_claims where user_id = v_u) <> 1
       or (select count(*) from public.hr_faction_ledger where user_id = v_u and kind = 'claim') <> 1 then
      raise exception 'faction-company §7(d): a refused claim wrote a row'; end if;
    if public.hr_faction_view(v_u, 0)->'pieces' @> jsonb_build_array(jsonb_build_object('id', v_free, 'held', true)) is not true then
      raise exception 'faction-company §7(d): the section does not hold the claim: %', public.hr_faction_view(v_u, 0)->'pieces'; end if;

    -- (e) the buy, priced at the company's TOP Level: hero 1 made Level 90 (a fixture), hero 0 presses
    update public.player_state set level_xp = public.hr_char_xp_for_level(90) where user_id = v_u and slot = 1;
    v_lv1 := public.hr_level_of(v_u, 1);
    if public.hr_faction_top_level(v_u) <> greatest(v_lv1, coalesce(public.hr_level_of(v_u, 0), 1)) or v_lv1 <= coalesce(public.hr_level_of(v_u, 0), 1) then
      raise exception 'faction-company §7(e): the top Level reads % (hero 1 %, hero 0 %)', public.hr_faction_top_level(v_u), v_lv1, public.hr_level_of(v_u, 0); end if;
    v_price := public.hr_faction_piece_price(v_paid, v_lv1);
    if v_price is null or v_price <= public.hr_faction_piece_price(v_paid, 1) then
      raise exception 'faction-company §7(e): the price at Level % is %', v_lv1, v_price; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_buy(0, v_paid, public.hr_faction_piece_price(v_paid, 1), (k || '0008')::uuid);
    if v->>'error' is distinct from 'quote_changed' or (v->>'price')::bigint is distinct from v_price then
      raise exception 'faction-company §7(e): a buy at the low hero''s price answered %', v; end if;
    -- the purse is the account's (2026-12-15-account-gold.sql): short of the price, refused and nothing moves; then a fixture fills it
    update public.account_wallet set gold = v_price - 1 where user_id = v_u;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_buy(0, v_paid, v_price, (k || '0009')::uuid);
    if v->>'error' is distinct from 'insufficient_gold' or (select gold from public.account_wallet where user_id = v_u) <> v_price - 1
       or exists (select 1 from public.hr_faction_company_claims where user_id = v_u and piece_id = v_paid) then
      raise exception 'faction-company §7(e): a buy past the purse answered %', v; end if;
    update public.account_wallet set gold = v_price + 1000 where user_id = v_u;
    v_gold0 := v_price + 1000;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_buy(0, v_paid, v_price, (k || '000a')::uuid);
    v_gold1 := (select gold from public.account_wallet where user_id = v_u);
    if coalesce(v->>'ok', '') <> 'true' or v_gold0 - v_gold1 <> v_price then
      raise exception 'faction-company §7(e): the buy answered % and moved % gold, not %', v, v_gold0 - v_gold1, v_price; end if;
    if (select gold from public.hr_faction_company_claims where user_id = v_u and piece_id = v_paid) <> v_price
       or (select count(*) from public.hr_faction_ledger where user_id = v_u and kind = 'buy' and piece_id = v_paid) <> 1 then
      raise exception 'faction-company §7(e): the buy is not one claim and one journal row at its price'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_buy(1, v_paid, v_price, (k || '000b')::uuid);
    if v->>'error' is distinct from 'piece_owned' or (select gold from public.account_wallet where user_id = v_u) <> v_gold1 then
      raise exception 'faction-company §7(e): a second buy answered % or moved gold', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_buy(0, v_free, 1, (k || '000c')::uuid);
    if v->>'error' is distinct from 'piece_free' then raise exception 'faction-company §7(e): a free piece bought answered %', v; end if;

    -- (f) the swap on the company
    update public.hr_faction_companies set changed_at = now() - make_interval(secs => r.cooldown_ms / 1000.0 + 60) where user_id = v_u;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_swap_start(1, v_b, (k || '000d')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-company §7(f): the swap start answered %', v; end if;
    perform public.hr_faction_credit(v_u, 1, v_hunt_b, v_t + interval '1 day', v_t + interval '1 day' + make_interval(secs => r.swap_ms / 1000.0 + 3600));
    if (select swap_ms from public.hr_faction_companies where user_id = v_u) <> r.swap_ms then
      raise exception 'faction-company §7(f): the company''s swap time reads %', (select swap_ms from public.hr_faction_companies where user_id = v_u); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_faction_swap_finish(0, (k || '000e')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select faction from public.hr_faction_companies where user_id = v_u) is distinct from v_b then
      raise exception 'faction-company §7(f): the finish answered %', v; end if;
    if public.hr_faction_view(v_u, 1)->'standing'->>v_a is distinct from (select ms::text from public.hr_faction_company_standing where user_id = v_u and faction = v_a) then
      raise exception 'faction-company §7(f): the swap lost the old side''s standing'; end if;

    raise exception using errcode = 'HRF65', message = 'faction-company §7 complete - rolling back';
  exception when sqlstate 'HRF65' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = 'factions') is distinct from v_scope then
    raise exception 'faction-company §7: the probe left the switch moved'; end if;
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.hr_faction_companies where user_id = v_u)
     or exists (select 1 from public.hr_faction_ledger where user_id = v_u) or exists (select 1 from auth.users where id = v_u)
     or exists (select 1 from public.hr_faction_stock where wage_hours_pm is not null and open) then
    raise exception 'faction-company §7: a probe row leaked'; end if;

  -- (g) the grants
  foreach v_sig in array array['public.hr_faction_join(integer,text,uuid)', 'public.hr_faction_swap_start(integer,text,uuid)',
                               'public.hr_faction_swap_finish(integer,uuid)', 'public.hr_faction_swap_cancel(integer,uuid)',
                               'public.hr_faction_outfit_claim(integer,text,uuid)'] loop
    if has_function_privilege('anon', v_sig::regprocedure, 'execute') or not has_function_privilege('authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'faction-company §7(g): % is not authenticated-only', v_sig; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    foreach v_sig in array array['public.hr_faction_buy(integer,text,bigint,uuid)', 'public.hr_faction_company_lock(uuid)',
                                 'public.hr_faction_top_level(uuid)', 'public.hr_faction_view(uuid,integer)', 'public.hr_outfit_owned(uuid,integer)',
                                 'public.hr_faction_credit(uuid,integer,text,timestamptz,timestamptz)'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
        raise exception 'faction-company §7(g): % may run %', v_role, v_sig; end if;
    end loop;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'faction-company §7 OK: one side a company, standing summed over heroes and clamped per hero, the quartermaster claims and the dark buy at the top Level, the swap, the grants';
end $chk$;
