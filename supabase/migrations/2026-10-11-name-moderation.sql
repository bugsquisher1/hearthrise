-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-11-name-moderation.sql — A NAME ANOTHER PLAYER SEES IS THE SERVER'S
--                                  TO REFUSE, AND THE SERVER'S TO TAKE BACK.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Touches a ranked surface (the
-- leaderboard's name column), the player_ledger kind CHECK and the envelope,
-- so it moves only on a Security GO and the Coordinator applies it (one file,
-- tools/apply-migration.mjs). APPLY ORDER: last in the chain (after
-- 2026-10-16-first-day-seeds.sql); §0 refuses on a database missing what it
-- patches. THE CLIENT HALF (identity.js rename modal, chat-filter.js) rides the
-- next release AFTER this applies; an old client against this server simply
-- shows the server's refusal text for `name_blocked` as a generic failure, and
-- a new client against the old server never sees `must_rename` (absent = false).
--
-- RESTATEMENT-DEBT-ACK: one additive key in hr_state_of (37k chars, 8 patches deep) is a P1 moderation fix; a full restatement is cleanup slice 7, not this lane.
--   The patch is ONE anchor asserted exactly once ('inventory_complete'), §0 and §12.

-- ── THE FINDING (Security, verified read-only 2026-10-11) ────────────────────
--   A live player's Total Level leaderboard name is a racial slur. The server
--   had NO content filter: hr_validate_display_name checked length, charset and
--   18 reserved words. identity.js left profanity to the client, whose
--   SLUR_HASHES were placeholders, and a direct RPC call skips the client
--   anyway. Clan names were checked for length only and the `clans creatable`
--   policy let `authenticated` INSERT a clan directly. Three tables keep a
--   STAMPED copy of the name (market_listings.seller_name,
--   market_buy_offers.buyer_name, chat_messages.from_name) that no rename ever
--   touched — so a moderated name would have stayed world-readable through
--   PostgREST even after the leaderboard stopped showing it.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1  hr_name_blocklist(stem, kind slur|obscene, match exact|substring,
--       pattern GENERATED) — server-only (RLS on, no policy, no client grant).
--       The seed is §1b. It is never shipped in src/ or the client bundle.
--   §2  hr_name_holds(fold PK) — a moderated name's FOLD KEY, so neither it nor
--       any spacing/leet/case variant of it can be claimed again. Server-only.
--   §3  profiles.name_state ('ok'|'flagged') and profiles.must_rename. And the
--       profiles SELECT grant is narrowed to its five public columns: the two
--       moderation columns are NOT world-readable (they would publish who was
--       moderated); the player learns their own state from the envelope.
--   §4  hr_name_fold(text) IMMUTABLE and hr_name_blocked(text) STABLE DEFINER.
--   §5  hr_validate_display_name: reserved `Adventurer<digits>` (only the
--       moderator mints those) and `blocked`. Now STABLE (it reads §1/§2).
--   §6  claim_display_name__ungated / hr_display_name_available__ungated:
--       a blocked name answers {ok:false, error:'name_blocked'} — through the
--       existing hr_note_rejection wrapper, so it is journalled in
--       hr_rejections under code name_blocked and the NAME IS NEVER ECHOED (no
--       name, no canonical in the refusal). A successful claim clears
--       must_rename / name_state. The claim takes the per-player name lock.
--   §7  BEFORE INSERT/UPDATE triggers on display_names and clans: a blocked
--       name raises 23514 `name_blocked` whatever path wrote it.
--   §8  clan_create refuses `name_blocked` (journalled); the `clans creatable`
--       INSERT policy is DROPPED and INSERT revoked from anon/authenticated —
--       the client founds a hold only through clan_create (src/features/
--       clans.js:247), which is one transaction with the ledger row.
--   §9  player_ledger.kind admits 'moderation_rename'.
--   §10 THE STAMPED COPIES FOLLOW THE NAME. An AFTER UPDATE OF display_name
--       trigger on profiles re-stamps that player's market listings, buy offers
--       and chat lines from the SAME derivation each stamp uses at insert. The
--       two immutability triggers (chat, offers) admit exactly that update and
--       nothing else: every other column unchanged AND the new name equal to
--       the derived one — a value the trigger computes, never one it accepts.
--   §11 hr_mod_force_rename(p_user, p_reason) — callable by NO client role.
--       Sets `Adventurer-NNNN` (unique), name_state 'flagged', must_rename
--       true, holds the old fold key, journals one player_ledger row (kind
--       'moderation_rename', meta {old_canon_hash, reason}) and refreshes the
--       leaderboard. Run by the Coordinator via tools/moderate-name.mjs.
--   §12 hr_state_of projects `must_rename` (top level, boolean).
--   §13 SELF-CHECK (CLAUDE.md §4), BY EXECUTION.
--
-- ── WHY THE READS DO NOT CHANGE ─────────────────────────────────────────────
-- The moderation REWRITES the one source every name read joins on
-- (profiles.display_name + display_names), so leaderboard_ranked (joins
-- profiles), hr_display_name_of, the town crier, party views, the chat INSERT
-- stamp and the market listing stamp all show the placeholder with no body
-- change. The only reads that did NOT join by id were the three stamped
-- columns, and §10 makes them follow. Rewriting at rest (rather than projecting
-- at read time) is deliberate: the stamped columns are world-readable through
-- PostgREST, so a read-time projection would have left the slur one GET away.
--
-- ── THE MATCHER, AND THE SCUNTHORPE LINE ────────────────────────────────────
-- fold: NFKD (compatibility + canonical decomposition, so fullwidth letters
--   become ASCII and diacritics become strippable marks) → Cyrillic/Greek
--   homoglyphs (and Latin dotless i) to Latin → lower → strip combining marks → leet
--   (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, 8 b, 9 g, @ a, $ s, ! i, | l, + t) → drop
--   everything outside a-z (separators, other digits) → runs of 3+ collapse
--   to 2. A second and third fold read `1` as `l` and `l` as `i`.
-- match: each stem compiles to `c+` per letter, so `niiiggggerrr` matches
--   `nigger` while a DOUBLE letter in the stem still demands two — which is
--   exactly what keeps Finnigan (one g) and Niger off the n-word list without
--   letting the doubled spelling through. `exact` = the whole fold, with an
--   optional plural (`s`, `es`); `substring` = anywhere.
-- Every stem with an innocent English superstring is EXACT: cock (Peacock,
--   Cockburn, Hancock), dick (Dickens), cunt (Scunthorpe), shit (Shitake,
--   Shiitake), coon (Raccoon, Cocoon), spic (Spicer), sex (Essex, Sussex),
--   ass (Assassin, Classic), anal (Analyst, Canal), rape (Grape), rapist
--   (Therapist), pedo (Torpedo), negro (Montenegro), paki (Pakistan), dago
--   (Santiago), nazi (Ashkenazi), cum (Cumberland), arse (Arsenal), tits
--   (Titanic), penis (Penistone), wank (Swanky). The cost is stated: an
--   exact stem embedded in a longer handle ("BigCock") passes, and is what
--   tools/moderate-name.mjs is for. Substring stems are the ones whose every
--   superstring is itself the slur. Known, accepted collateral: "Snigger".
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- claim_display_name__ungated and hr_mod_force_rename both take
-- pg_advisory_xact_lock(hashtext('hr_display_name'), hashtext(<uid>)) BEFORE
-- they validate. Without it a claim that validated before a moderation
-- committed could, after waiting on the display_names row lock, write the
-- just-held name back (READ COMMITTED re-evaluates the UPDATE, not the
-- validation). With it the claim's validation runs after the moderation
-- commits and sees the hold. Uniqueness of the placeholder is the
-- display_names PRIMARY KEY's, not this file's: the pick probes and the insert
-- catches unique_violation.
-- IDEMPOTENCY: a moderator replay on a player who is still flagged and still
-- wears a placeholder returns {ok:true, already:true} and writes nothing (one
-- ledger row per moderation). The claim RPCs are idempotent as before.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- ~95 stem rows, read by a seq scan of ~95 tiny regexes per check; a check runs
-- once per claim/availability probe/clan found (all rate-gated) — never on a
-- tick or a settle. hr_name_holds grows by one row per moderation. The
-- re-stamp touches one player's listings/offers/chat rows on a RENAME only
-- (rate-gated; chat_messages is pruned). The envelope adds one PK read of
-- profiles per hr_state_of.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive except: the `clans creatable` policy and its INSERT grant (re-apply
-- 2026-08-11-clan-write-policy-pin.sql to restore), the profiles SELECT grant
-- (`grant select on public.profiles to anon, authenticated`), and the restated
-- bodies (re-run their last toucher: 2026-08-08-unique-names.sql for the name
-- trio, 2026-08-11-clan-membership-authority.sql's clan_create, 2026-08-11-
-- chat-name-authority.sql's hr_chat_immutable, 2026-08-12-market-offers-
-- authority.sql's hr_market_offer_immutable). hr_state_of: remove the
-- must_rename line by hand. A rename that already happened is journalled and
-- is NOT reversed by dropping anything here (the player picks a new name).
--
-- ⚠ AFTER APPLYING: `node tests/live-hash-drift.mjs --live --write` (hr_state_of),
--   why from `--codediff`; restore-census classifies hr_name_blocklist (catalogue,
--   reseeded by this file) and hr_name_holds (PLAYER-DERIVED moderation state:
--   must be restored). Coordinator only.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
declare v_def text; v_n int;
  c_anchor constant text := $anc$    'inventory_complete', ($anc$;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.display_names') is null
     or to_regclass('public.clans') is null or to_regclass('public.player_ledger') is null
     or to_regclass('public.chat_messages') is null or to_regclass('public.market_listings') is null
     or to_regclass('public.market_buy_offers') is null or to_regclass('public.leaderboard_ranked') is null then
    raise exception 'name-moderation: a table this file guards is missing - apply the chain first'; end if;
  if to_regprocedure('public.hr_canon_display_name(text)') is null
     or to_regprocedure('public.claim_display_name__ungated(text)') is null
     or to_regprocedure('public.hr_display_name_available__ungated(text)') is null
     or to_regprocedure('public.clan_create(text,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,int,jsonb)') is null
     or to_regprocedure('public.hr_display_name_of(uuid)') is null
     or to_regprocedure('public.hr_leaderboard_refresh(boolean)') is null
     or to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'name-moderation: a function this file wraps is missing - apply the chain first'; end if;
  if current_setting('server_encoding') <> 'UTF8' then
    raise exception 'name-moderation: hr_name_fold needs a UTF8 database (normalize())'; end if;
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'must_rename'$q$) = 0 then
    v_n := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
    if v_n <> 1 then
      raise exception 'hr_state_of: the inventory_complete anchor appears % time(s), expected exactly 1', v_n; end if;
  end if;
end $mig$;

-- ── 1. THE BLOCKLIST — SERVER-ONLY ──────────────────────────────────────────
create table if not exists public.hr_name_blocklist (
  stem    text primary key check (stem ~ '^[a-z]{2,32}$'),
  kind    text not null check (kind in ('slur', 'obscene')),
  match   text not null check (match in ('exact', 'substring')),
  -- Each letter becomes `x+`: repeats are absorbed, a doubled stem letter
  -- still needs two. Derived, so no row can carry a hand-written regex.
  pattern text generated always as (regexp_replace(stem, '([a-z])', '\1+', 'g')) stored
);
alter table public.hr_name_blocklist enable row level security;
revoke all on public.hr_name_blocklist from public, anon, authenticated;
comment on table public.hr_name_blocklist is
  'Display/clan name content blocklist (2026-10-11-name-moderation.sql). Server-only: read by '
  'hr_name_blocked() (SECURITY DEFINER); no client grant, never in the client bundle. Stems are '
  'already folded (a-z). exact = whole fold (+ optional plural); substring = anywhere.';

-- ── 1b. THE SEED (GENERATED SECTION — the whole list, idempotent) ───────────
-- Written in full on every apply so a second apply is byte-identical. A stem
-- REMOVED from this list must be deleted by the next file that removes it.
insert into public.hr_name_blocklist (stem, kind, match) values
  -- slurs (and hate symbols)
  ('nigger','slur','substring'), ('nigga','slur','substring'), ('niglet','slur','substring'),
  ('negro','slur','exact'),      ('chink','slur','exact'),      ('gook','slur','exact'),
  ('kike','slur','exact'),       ('spic','slur','exact'),       ('wetback','slur','substring'),
  ('beaner','slur','substring'), ('coon','slur','exact'),       ('jigaboo','slur','substring'),
  ('porchmonkey','slur','substring'), ('raghead','slur','substring'), ('towelhead','slur','substring'),
  ('paki','slur','exact'),       ('faggot','slur','substring'), ('fag','slur','exact'),
  ('dyke','slur','exact'),       ('tranny','slur','substring'), ('shemale','slur','substring'),
  ('retard','slur','substring'), ('wop','slur','exact'),        ('dago','slur','exact'),
  ('kraut','slur','exact'),      ('gyppo','slur','exact'),      ('wog','slur','exact'),
  ('injun','slur','exact'),      ('squaw','slur','exact'),      ('redskin','slur','substring'),
  ('zipperhead','slur','substring'), ('tarbaby','slur','substring'), ('golliwog','slur','substring'),
  ('heeb','slur','exact'),       ('hymie','slur','exact'),      ('yid','slur','exact'),
  ('mongoloid','slur','substring'), ('honky','slur','exact'),   ('hitler','slur','substring'),
  ('nazi','slur','exact'),       ('kukluxklan','slur','substring'), ('siegheil','slur','substring'),
  -- strong obscenity
  ('fuck','obscene','substring'),  ('cunt','obscene','exact'),       ('cock','obscene','exact'),
  ('dick','obscene','exact'),      ('shit','obscene','exact'),       ('bullshit','obscene','substring'),
  ('shithead','obscene','substring'), ('asshole','obscene','substring'), ('ass','obscene','exact'),
  ('arse','obscene','exact'),      ('bitch','obscene','substring'),  ('bastard','obscene','exact'),
  ('whore','obscene','substring'), ('slut','obscene','substring'),   ('pussy','obscene','exact'),
  ('penis','obscene','exact'),     ('vagina','obscene','substring'), ('dildo','obscene','substring'),
  ('cum','obscene','exact'),       ('cumshot','obscene','substring'), ('jizz','obscene','substring'),
  ('wank','obscene','exact'),      ('wanker','obscene','substring'), ('twat','obscene','exact'),
  ('tits','obscene','exact'),      ('boobs','obscene','exact'),      ('blowjob','obscene','substring'),
  ('handjob','obscene','substring'), ('rimjob','obscene','substring'), ('anal','obscene','exact'),
  ('anus','obscene','exact'),      ('rape','obscene','exact'),       ('rapist','obscene','exact'),
  ('molest','obscene','substring'), ('pedo','obscene','exact'),      ('paedo','obscene','exact'),
  ('pedophile','obscene','substring'), ('paedophile','obscene','substring'),
  ('cocksucker','obscene','substring'), ('porn','obscene','substring'), ('sex','obscene','exact'),
  ('horny','obscene','exact'),     ('milf','obscene','exact'),       ('bollocks','obscene','substring'),
  ('prick','obscene','exact'),     ('knob','obscene','exact'),       ('clit','obscene','exact'),
  ('clitoris','obscene','substring'), ('semen','obscene','exact'),   ('orgasm','obscene','substring'),
  ('boner','obscene','exact'),     ('skank','obscene','substring')
on conflict (stem) do update set kind = excluded.kind, match = excluded.match;

-- ── 2. THE HELD NAMES — a moderated name is never claimable again ───────────
create table if not exists public.hr_name_holds (
  fold     text primary key check (fold ~ '^[a-z]+$'),
  user_id  uuid,                                   -- whose name it was (no FK: survives the account)
  held_at  timestamptz not null default now()
);
alter table public.hr_name_holds enable row level security;
revoke all on public.hr_name_holds from public, anon, authenticated;
comment on table public.hr_name_holds is
  'Fold keys (hr_name_fold) of names taken back by hr_mod_force_rename. hr_name_blocked() refuses '
  'any name whose fold equals one. Server-only; PLAYER-DERIVED moderation state (restore it).';

-- ── 3. PROFILES: THE MODERATION STATE, NOT WORLD-READABLE ───────────────────
alter table public.profiles add column if not exists name_state  text    not null default 'ok';
alter table public.profiles add column if not exists must_rename boolean not null default false;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_state_chk'
                  and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_name_state_chk
      check (name_state in ('ok', 'flagged'));
  end if;
end $mig$;
-- profiles is `for select using (true)` to everyone. A table-level grant would
-- publish the two new columns (who was moderated); a column list does not.
-- The client reads `id,display_name` only (src/features/clans.js:382); the
-- two RLS policies that read profiles use id and clan_id.
revoke select on public.profiles from anon, authenticated;
grant  select (id, display_name, created_at, updated_at, clan_id) on public.profiles to anon, authenticated;

-- ── 4. THE FOLD AND THE MATCHER ─────────────────────────────────────────────
create or replace function public.hr_name_fold(p_text text)
returns text language sql immutable parallel safe set search_path = pg_catalog as $$
  select regexp_replace(
           regexp_replace(
             translate(
               regexp_replace(
                 lower(translate(normalize(coalesce(p_text, ''), NFKD),
                   -- Cyrillic upper, Cyrillic lower, Greek upper, Greek lower → Latin
                   U&'\0410\0412\0415\041A\041C\041D\041E\0420\0421\0422\0423\0425\0406\0408\0405'
                   || U&'\0430\0432\0435\043A\043C\043D\043E\0440\0441\0442\0443\0445\0456\0458\0455\0501\04CF\043F'
                   || U&'\0391\0392\0395\0396\0397\0399\039A\039C\039D\039F\03A1\03A4\03A5\03A7'
                   || U&'\03B1\03B2\03B5\03B9\03BA\03BD\03BF\03C1\03C4\03C5\03C7\03B7\03B3'
                   || U&'\0131',                                  -- Latin dotless i (no decomposition)
                   'abekmhopctyxijs'
                   || 'abekmhopctyxijsdln'
                   || 'abezhikmnoptyx'
                   || 'abeikvoptuxny'
                   || 'i')),
                 U&'[\0300-\036F]', '', 'g'),
               '0134579@$!|+8', 'oieastgasiltb'),
             '[^a-z]', '', 'g'),
           '([a-z])\1\1+', '\1\1', 'g')
$$;
revoke execute on function public.hr_name_fold(text) from public;
revoke execute on function public.hr_name_fold(text) from anon, authenticated;
comment on function public.hr_name_fold(text) is
  'Content-match key for names: NFKD, homoglyph→Latin, lower, strip marks, leet, a-z only, runs of 3+ '
  'collapse to 2 (2026-10-11-name-moderation.sql). NOT the uniqueness key (hr_canon_display_name).';

create or replace function public.hr_name_blocked(p_text text)
returns boolean language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_a text := public.hr_name_fold(p_text);
  v_b text := public.hr_name_fold(translate(coalesce(p_text, ''), '1', 'l'));   -- 1 read as l
  v_c text := translate(v_a, 'l', 'i');                                         -- l read as I
begin
  if v_a = '' and v_b = '' then return false; end if;
  return exists (
           select 1 from public.hr_name_blocklist w
            where (w.match = 'substring' and (v_a ~ w.pattern or v_b ~ w.pattern or v_c ~ w.pattern))
               or (w.match = 'exact' and (v_a ~ ('^' || w.pattern || '(e?s+)?$')
                                          or v_b ~ ('^' || w.pattern || '(e?s+)?$')
                                          or v_c ~ ('^' || w.pattern || '(e?s+)?$'))))
      or exists (select 1 from public.hr_name_holds h where h.fold in (v_a, v_b, v_c));
end $$;
revoke execute on function public.hr_name_blocked(text) from public;
revoke execute on function public.hr_name_blocked(text) from anon, authenticated;
comment on function public.hr_name_blocked(text) is
  'TRUE when a display/clan name hits hr_name_blocklist (exact or substring on hr_name_fold) or a '
  'held name. Never returns or logs which stem (2026-10-11-name-moderation.sql).';

-- ── 5. hr_validate_display_name — RESERVED PLACEHOLDERS, AND BLOCKED ────────
-- Restated from 2026-08-08-unique-names.sql; two blocks added (marked). Now
-- STABLE: it reads §1/§2 through hr_name_blocked.
create or replace function public.hr_validate_display_name(p_name text)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_name  text;
  v_canon text;
  c_reserved constant text[] := array[
    'admin','administrator','moderator','moderators','mod','gm','game master',
    'hearthrise','system','server','support','staff','dev','developer',
    'null','undefined','anonymous','adventurer'
  ];
begin
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(v_name) < 3  then return jsonb_build_object('ok', false, 'reason', 'short');   end if;
  if length(v_name) > 20 then return jsonb_build_object('ok', false, 'reason', 'long');    end if;
  -- Hyphen is LAST in the bracket expression so it is a literal, not a range.
  if v_name !~ '^[A-Za-z0-9][A-Za-z0-9 _''’.-]*[A-Za-z0-9]$' then
    return jsonb_build_object('ok', false, 'reason', 'charset');
  end if;
  v_canon := public.hr_canon_display_name(v_name);
  if length(v_canon) < 3 then return jsonb_build_object('ok', false, 'reason', 'short'); end if;
  -- Reserved names are matched with separators REMOVED (see the original file).
  if regexp_replace(v_canon, '\s+', '', 'g') = any (
       select regexp_replace(r, '\s+', '', 'g') from unnest(c_reserved) as r)
  then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  -- (2026-10-11) THE PLACEHOLDER SHAPE IS THE MODERATOR'S. `Adventurer-1234` is
  -- what hr_mod_force_rename assigns; a player wearing one by choice would read
  -- as moderated, and a player keeping theirs would never leave the rename.
  if regexp_replace(v_canon, '\s+', '', 'g') ~ '^adventurer[0-9]+$' then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  -- (2026-10-11) CONTENT. No stem, no name, no canonical in the answer.
  if public.hr_name_blocked(v_name) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  return jsonb_build_object('ok', true, 'name', v_name, 'canonical', v_canon);
end $$;
revoke execute on function public.hr_validate_display_name(text) from public;
revoke execute on function public.hr_validate_display_name(text) from anon, authenticated;

-- ── 6. THE CLAIM AND THE AVAILABILITY PROBE ─────────────────────────────────
-- Restated from 2026-08-08-unique-names.sql. Deltas (marked): the per-player
-- name lock, `name_blocked` as its own error, and clearing the moderation flags.
create or replace function public.claim_display_name__ungated(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_val   jsonb;
  v_name  text;
  v_canon text;
  v_rows  int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- (2026-10-11) THE NAME LOCK, BEFORE VALIDATION — see the file header. The
  -- moderator takes the same key, so a hold it commits is seen below.
  perform pg_advisory_xact_lock(hashtext('hr_display_name'), hashtext(v_uid::text));

  v_val := public.hr_validate_display_name(p_name);
  if not (v_val->>'ok')::boolean then
    if v_val->>'reason' = 'blocked' then
      -- Never echo the name: the refusal is journalled by hr_note_rejection.
      return jsonb_build_object('ok', false, 'error', 'name_blocked');
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid', 'reason', v_val->>'reason');
  end if;
  v_name  := v_val->>'name';
  v_canon := v_val->>'canonical';

  insert into public.profiles (id) values (v_uid) on conflict do nothing;

  -- (a) IDEMPOTENT RE-CLAIM of the caller's own canonical name.
  update public.display_names
     set name = v_name
   where user_id = v_uid and canonical = v_canon;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.profiles set display_name = v_name, name_state = 'ok', must_rename = false
     where id = v_uid;
    return jsonb_build_object('ok', true, 'name', v_name, 'canonical', v_canon,
                              'renamed', false);
  end if;

  -- (b) CLAIM or RENAME — the unique index decides who wins.
  begin
    if exists (select 1 from public.display_names where user_id = v_uid) then
      update public.display_names
         set canonical = v_canon, name = v_name, claimed_at = now()
       where user_id = v_uid;
    else
      insert into public.display_names (canonical, user_id, name)
        values (v_canon, v_uid, v_name);
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'taken', 'canonical', v_canon);
  end;

  -- (2026-10-11) A chosen name clears the moderation state.
  update public.profiles set display_name = v_name, name_state = 'ok', must_rename = false
   where id = v_uid;
  return jsonb_build_object('ok', true, 'name', v_name, 'canonical', v_canon,
                            'renamed', true);
end $$;
revoke execute on function public.claim_display_name__ungated(text) from public;
revoke execute on function public.claim_display_name__ungated(text) from anon, authenticated, service_role;

create or replace function public.hr_display_name_available__ungated(p_name text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_val   jsonb;
  v_canon text;
  v_owner uuid;
begin
  v_val := public.hr_validate_display_name(p_name);
  if not (v_val->>'ok')::boolean then
    if v_val->>'reason' = 'blocked' then
      return jsonb_build_object('ok', false, 'error', 'name_blocked');   -- (2026-10-11)
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid', 'reason', v_val->>'reason');
  end if;
  v_canon := v_val->>'canonical';
  select user_id into v_owner from public.display_names where canonical = v_canon;
  return jsonb_build_object(
    'ok', true,
    'available', (v_owner is null or v_owner = auth.uid()),
    'mine', (v_owner is not null and v_owner = auth.uid()),
    'name', v_val->>'name', 'canonical', v_canon);
end $$;
revoke execute on function public.hr_display_name_available__ungated(text) from public;
revoke execute on function public.hr_display_name_available__ungated(text) from anon, authenticated, service_role;

-- ── 7. THE BACKSTOP TRIGGERS — whatever path writes the name ────────────────
create or replace function public.hr_name_guard()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- display_names and clans both carry the player-visible text in `name`.
  if public.hr_name_blocked(new.name) then
    raise exception 'name_blocked' using errcode = '23514';   -- never the name
  end if;
  return new;
end $$;
revoke execute on function public.hr_name_guard() from public;
revoke execute on function public.hr_name_guard() from anon, authenticated;

drop trigger if exists hr_display_names_name_guard on public.display_names;
create trigger hr_display_names_name_guard
  before insert or update of name on public.display_names
  for each row execute function public.hr_name_guard();
drop trigger if exists hr_clans_name_guard on public.clans;
create trigger hr_clans_name_guard
  before insert or update of name on public.clans
  for each row execute function public.hr_name_guard();

-- ── 8. clan_create — REFUSES A BLOCKED NAME; THE DIRECT INSERT IS GONE ──────
-- Restated from 2026-08-11-clan-membership-authority.sql; one block added.
create or replace function public.clan_create(p_name text, p_join_policy text default 'open')
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := btrim(coalesce(p_name, ''));
  v_policy text := lower(btrim(coalesce(p_join_policy, 'open')));
  v_mine   uuid;
  v_id     uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rpc_gate('clan_create') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if length(v_name) < 3 or length(v_name) > 24 then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;
  -- (2026-10-11) CONTENT, journalled under name_blocked; the name is not echoed.
  if public.hr_name_blocked(v_name) then
    return public.hr_note_rejection('clan_create', 0,
      jsonb_build_object('ok', false, 'error', 'name_blocked'));
  end if;
  if v_policy not in ('open','invite') then
    return jsonb_build_object('ok', false, 'error', 'bad_policy');
  end if;

  select clan_id into v_mine from public.clan_members where user_id = v_uid;
  if v_mine is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_clan', 'clan_id', v_mine);
  end if;

  begin
    insert into public.clans (name, created_by, join_policy)
      values (v_name, v_uid, v_policy) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;

  insert into public.clan_members (clan_id, user_id, role) values (v_id, v_uid, 'leader');
  insert into public.clan_ledger (clan_id, user_id, kind, item_id)
    values (v_id, v_uid, 'member', 'create');

  return jsonb_build_object('ok', true, 'clan_id', v_id, 'name', v_name,
    'role', 'leader', 'join_policy', v_policy, 'members', 1);
end $$;
revoke execute on function public.clan_create(text, text) from public;
revoke execute on function public.clan_create(text, text) from anon, service_role;
grant  execute on function public.clan_create(text, text) to authenticated;

drop policy if exists "clans creatable" on public.clans;
revoke insert on public.clans from anon, authenticated;

-- ── 9. THE LEDGER KIND ──────────────────────────────────────────────────────
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null then
    raise exception 'player_ledger_kind_check is absent - the moderation row would be unconstrained'; end if;
  if position('''moderation_rename''' in v_def) > 0 then
    raise notice 'player_ledger.kind already admits ''moderation_rename'' - widen skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, '''accrue''::text', ''))) <> length('''accrue''::text') then
    raise exception 'player_ledger_kind_check has no single ''accrue''::text anchor (%) - refusing to widen blind', v_def; end if;
  v_new := replace(v_def, '''accrue''::text', '''accrue''::text, ''moderation_rename''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
end $mig$;

-- ── 10. THE STAMPED COPIES FOLLOW THE NAME ──────────────────────────────────
-- Each derivation is the one its INSERT stamp uses:
--   market_listings.seller_name  hr_display_name_of(uid)            (hr_market_list)
--   market_buy_offers.buyer_name coalesce(nullif(btrim(..)),'Adventurer') (hr_market_offer_stamp)
--   chat_messages.from_name      left(coalesce(nullif(btrim(..)),'Adventurer'),24) (hr_chat_name_authority)
create or replace function public.hr_chat_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  -- (2026-10-11) THE ONE ADMITTED UPDATE: the name re-stamp. Every other column
  -- unchanged and the new name equal to the DERIVED one, never a supplied one.
  if tg_op = 'UPDATE'
     and new.id = old.id and new.channel = old.channel
     and new.from_id is not distinct from old.from_id
     and new.body = old.body and new.mentions is not distinct from old.mentions
     and new.created_at = old.created_at
     and new.from_name = left(coalesce(nullif(btrim(coalesce(
           (select pr.display_name from public.profiles pr where pr.id = new.from_id), '')), ''),
           'Adventurer'), 24) then
    return new;
  end if;
  raise exception 'chat_messages is append-only (attempted %)', tg_op
    using errcode = 'check_violation';
end $$;
revoke execute on function public.hr_chat_immutable() from public;
revoke execute on function public.hr_chat_immutable() from anon, authenticated;

create or replace function public.hr_market_offer_immutable()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  -- (2026-10-11) Same single admitted update as hr_chat_immutable.
  if new.id = old.id and new.buyer_user_id = old.buyer_user_id
     and new.buyer_slot = old.buyer_slot and new.item_id = old.item_id
     and new.qty = old.qty and new.max_each = old.max_each
     and new.escrowed = old.escrowed and new.posted_at = old.posted_at
     and new.buyer_name = coalesce(
           (select nullif(btrim(p.display_name), '') from public.profiles p where p.id = new.buyer_user_id),
           'Adventurer') then
    return new;
  end if;
  raise exception 'offer_immutable: a posted buy offer cannot be changed — cancel and repost'
    using errcode = '42501';
end $$;
revoke execute on function public.hr_market_offer_immutable() from public;
revoke execute on function public.hr_market_offer_immutable() from anon, authenticated;

create or replace function public.hr_name_restamp()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  update public.market_listings
     set seller_name = public.hr_display_name_of(new.id)
   where seller_user_id = new.id
     and seller_name is distinct from public.hr_display_name_of(new.id);
  update public.market_buy_offers
     set buyer_name = coalesce(nullif(btrim(new.display_name), ''), 'Adventurer')
   where buyer_user_id = new.id
     and buyer_name is distinct from coalesce(nullif(btrim(new.display_name), ''), 'Adventurer');
  update public.chat_messages
     set from_name = left(coalesce(nullif(btrim(coalesce(new.display_name, '')), ''), 'Adventurer'), 24)
   where from_id = new.id
     and from_name is distinct from
         left(coalesce(nullif(btrim(coalesce(new.display_name, '')), ''), 'Adventurer'), 24);
  return null;
end $$;
revoke execute on function public.hr_name_restamp() from public;
revoke execute on function public.hr_name_restamp() from anon, authenticated;

drop trigger if exists hr_profiles_name_restamp on public.profiles;
create trigger hr_profiles_name_restamp
  after update of display_name on public.profiles
  for each row when (old.display_name is distinct from new.display_name)
  execute function public.hr_name_restamp();

-- ── 11. THE MODERATOR'S RENAME — NO CLIENT ROLE ─────────────────────────────
create or replace function public.hr_mod_force_rename(p_user uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_prof   public.profiles%rowtype;
  v_canon  text;
  v_fold   text;
  v_base   int;
  v_try    int := 0;
  v_place  text;
  v_done   boolean := false;
  v_ledger bigint;
begin
  if p_user is null then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;
  if length(v_reason) < 3 then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;

  perform pg_advisory_xact_lock(hashtext('hr_display_name'), hashtext(p_user::text));
  select * into v_prof from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_profile'); end if;

  -- IDEMPOTENT: still flagged and still wearing a placeholder → nothing to do.
  if v_prof.name_state = 'flagged' and v_prof.must_rename
     and coalesce(v_prof.display_name, '') ~ '^Adventurer-[0-9]+$' then
    return jsonb_build_object('ok', true, 'already', true, 'user', p_user,
                              'placeholder', v_prof.display_name);
  end if;

  select canonical into v_canon from public.display_names where user_id = p_user;
  v_canon := coalesce(v_canon, public.hr_canon_display_name(v_prof.display_name));
  v_fold  := public.hr_name_fold(v_prof.display_name);
  if v_fold <> '' then
    insert into public.hr_name_holds (fold, user_id) values (v_fold, p_user)
      on conflict (fold) do nothing;
  end if;

  -- A deterministic, per-player start (no counter to leak), probed upward; the
  -- display_names PRIMARY KEY is the arbiter, so a concurrent claimant loses
  -- cleanly to unique_violation and the loop moves on.
  v_base := (hashtext(p_user::text)::bigint & 2147483647)::int % 9000;
  while not v_done loop
    v_place := 'Adventurer-' || case when v_try < 9000 then (1000 + (v_base + v_try) % 9000)::text
                                     else (10000 + v_try - 9000)::text end;
    begin
      if exists (select 1 from public.display_names where user_id = p_user) then
        update public.display_names
           set canonical = public.hr_canon_display_name(v_place), name = v_place, claimed_at = now()
         where user_id = p_user;
      else
        insert into public.display_names (canonical, user_id, name)
          values (public.hr_canon_display_name(v_place), p_user, v_place);
      end if;
      v_done := true;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20000 then raise exception 'hr_mod_force_rename: no free placeholder'; end if;
    end;
  end loop;

  -- The re-stamp trigger (§10) carries this to listings, offers and chat.
  update public.profiles
     set display_name = v_place, name_state = 'flagged', must_rename = true, updated_at = now()
   where id = p_user;

  insert into public.player_ledger (user_id, slot, kind, intent, meta)
  values (p_user, 0, 'moderation_rename', 'moderation_rename',
          jsonb_build_object('old_canon_hash', md5(coalesce(v_canon, '')), 'reason', v_reason,
                             'placeholder', v_place))
  returning id into v_ledger;

  perform public.hr_leaderboard_refresh(true);

  return jsonb_build_object('ok', true, 'user', p_user, 'placeholder', v_place, 'ledger_id', v_ledger);
end $$;
revoke execute on function public.hr_mod_force_rename(uuid, text) from public;
revoke execute on function public.hr_mod_force_rename(uuid, text) from anon, authenticated, service_role;
comment on function public.hr_mod_force_rename(uuid, text) is
  'Moderator-only (no client, no service_role grant): replace a player''s display name with '
  'Adventurer-NNNN, flag + must_rename, hold the old fold key, journal kind moderation_rename, '
  'refresh the boards. Run via tools/moderate-name.mjs (2026-10-11-name-moderation.sql).';

-- ── 12. THE ENVELOPE CARRIES must_rename ────────────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'must_rename'$q$) > 0 then
    raise notice 'hr_state_of already projects must_rename - patch skipped'; return; end if;
  v_def := replace(v_def, $anc$    'inventory_complete', ($anc$,
    $anc$    -- ── must_rename (2026-10-11-name-moderation.sql) ── the player's own
    --    moderation flag; the client opens a non-dismissable rename prompt.
    'must_rename', coalesce((select pr.must_rename from public.profiles pr
                              where pr.id = p_user), false),
    'inventory_complete', ($anc$);
  execute v_def;
end $mig$;
revoke execute on function public.hr_state_of(uuid, int) from public;
revoke execute on function public.hr_state_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 13. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) — EXECUTED ────────────────
do $$
declare
  v        jsonb;
  v_h      jsonb;
  v_role   text;
  v_s      text;
  v_item   text;
  v_place  text;
  v_n      int;
  v_uid    constant uuid := '000000c0-0000-4000-8000-00000a3e0d01';
  v_uid2   constant uuid := '000000c0-0000-4000-8000-00000a3e0d02';
  -- Fixtures. Every one MUST be refused, in every spelling.
  c_blocked constant text[] := array[
    'nigger', 'NIGGER', 'n1gg3r', 'n i g g e r', 'n.i.g.g.e.r', 'niiiggggerrr', 'xXniggerXx',
    'ni99er', 'n|gger',
    U&'n\0456gg\0435r',                                 -- Cyrillic i and e
    U&'\FF4E\FF49\FF47\FF47\FF45\FF52',                 -- fullwidth
    U&'n\0131gger',                                     -- Latin dotless i
    'faggot', 'F4GG0T', 'f a g g o t', 'fuck', 'FuCk', 'f.u.c.k', 'phuckfuck', 'fuuuuck',
    'MotherFucker', 'kike', 'K1KE', 'cunt', 'CUNTS', 'c u n t', 'Shithead', 'sh1t',
    'Sh!t', 'Dlck', 'Bltch', 'Cocks', 'Asses', 'wetback', 'raghead', 'Hitler88'];
  -- Every one MUST pass (the Scunthorpe line, and the real names it protects).
  c_clean constant text[] := array[
    'Raccoon', 'Dickens', 'Spicer', 'Peacock', 'Scunthorpe', 'Cockburn', 'Essex', 'Shitake',
    'Shiitake', 'Cocoon', 'Assassin', 'Classic', 'Bassist', 'Hancock', 'Pakistan', 'Montenegro',
    'Finnigan', 'Niger', 'Therapist', 'Grape', 'Analyst', 'Swanky', 'Sextant', 'Sussex',
    'Penistone', 'Cumberland', 'Arsenal', 'Titanic', 'Torpedo', 'Ashkenazi', 'Santiago',
    'Matsushita', 'Dagobert', 'Hitchcock', 'Glasgow', 'Bram Probe', 'Kaya', 'Iron Vale'];
begin
  -- (a) FOLD + MATCH.
  foreach v_s in array c_blocked loop
    if not public.hr_name_blocked(v_s) then
      raise exception 'GATE(a): blocked fixture #% passed the matcher', array_position(c_blocked, v_s); end if;
  end loop;
  foreach v_s in array c_clean loop
    if public.hr_name_blocked(v_s) then
      raise exception 'GATE(a): clean name % was blocked (Scunthorpe regression)', v_s; end if;
  end loop;
  if public.hr_name_fold(U&'N\0399GG\0395R') <> 'nigger' or public.hr_name_fold('n1gg3r!!!') <> 'niggerii' then
    raise exception 'GATE(a): hr_name_fold no longer folds homoglyph/leet'; end if;
  -- through the validator, for the ASCII variants a display name can carry
  if coalesce(public.hr_validate_display_name('n i g g e r')->>'reason', '') <> 'blocked'
     or coalesce(public.hr_validate_display_name('Raccoon')->>'ok', '') <> 'true'
     or coalesce(public.hr_validate_display_name('Adventurer-1234')->>'reason', '') <> 'reserved' then
    raise exception 'GATE(a): hr_validate_display_name does not apply blocked/reserved'; end if;

  -- (b) PRIVILEGE: no client reads the list or the holds, no client runs the
  --     moderator, no client inserts a clan, no client reads the flags.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_name_blocklist', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_name_holds', 'select,insert,update,delete') then
      raise exception 'GATE(b): % can touch the blocklist or the holds', v_role; end if;
    if has_table_privilege(v_role, 'public.clans', 'insert') then
      raise exception 'GATE(b): % can INSERT into clans directly', v_role; end if;
    if has_column_privilege(v_role, 'public.profiles', 'must_rename', 'select')
       or has_column_privilege(v_role, 'public.profiles', 'name_state', 'select')
       or not has_column_privilege(v_role, 'public.profiles', 'display_name', 'select') then
      raise exception 'GATE(b): % profiles column grants are wrong', v_role; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and (has_function_privilege(v_role, 'public.hr_mod_force_rename(uuid,text)', 'execute')
         or has_function_privilege(v_role, 'public.hr_name_blocked(text)', 'execute')) then
      raise exception 'GATE(b): % can execute hr_mod_force_rename / hr_name_blocked', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('hr_name_blocklist', 'hr_name_holds', 'clans')
              and cmd <> 'SELECT') then
    raise exception 'GATE(b): a write policy exists on the blocklist, the holds or clans'; end if;

  select item_id into v_item from public.hr_items where tradeable order by item_id limit 1;
  if v_item is null then raise exception 'GATE CANNOT RUN: no tradeable item in hr_items'; end if;

  begin  -- ── SUBTRANSACTION: every probe row is discarded at HR971 ───────────
    insert into auth.users (id) values (v_uid), (v_uid2);
    insert into public.profiles (id) values (v_uid), (v_uid2) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, 0, 123456, 0, 0, 1);

    -- (c) A DIRECT INSERT/UPDATE WITH A BLOCKED NAME RAISES (the trigger, as
    --     the definer itself - grants are not what stops it).
    begin
      insert into public.clans (name, created_by) values ('xXfuckXx', v_uid);
      raise exception 'GATE(c): a blocked clan name was inserted';
    exception when check_violation then null;
    end;
    begin
      insert into public.display_names (canonical, user_id, name) values ('k1ke', v_uid2, 'K1ke');
      raise exception 'GATE(c): a blocked display name was inserted';
    exception when check_violation then null;
    end;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    -- (d) THE CLAIM REFUSES name_blocked, JOURNALS IT, NEVER ECHOES IT.
    v := public.claim_display_name('n1gg3r');
    if coalesce(v->>'error', '') <> 'name_blocked' or v ? 'canonical' or v ? 'name' then
      raise exception 'GATE(d): a blocked claim answered %', v; end if;
    if not exists (select 1 from public.hr_rejections where user_id = v_uid and code = 'name_blocked')
       or exists (select 1 from public.hr_rejections where user_id = v_uid
                   and last_detail::text ~* 'n1gg3r|nigger') then
      raise exception 'GATE(d): name_blocked not journalled, or journalled WITH the name'; end if;
    v := public.hr_display_name_available('Fuck Face');
    if coalesce(v->>'error', '') <> 'name_blocked' then
      raise exception 'GATE(d): the availability probe answered % for a blocked name', v; end if;
    v := public.clan_create('B1tch Hold', 'open');
    if coalesce(v->>'error', '') <> 'name_blocked' or exists (select 1 from public.clans where created_by = v_uid) then
      raise exception 'GATE(d): clan_create answered % for a blocked name', v; end if;

    -- (e) A LEGAL NAME, A LISTING, AN OFFER, A CHAT LINE.
    delete from public.hr_rate_counters;
    v := public.claim_display_name('Mallow Probe');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'GATE(e): a legal claim answered %', v; end if;
    insert into public.market_listings (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each, expires_at)
      values (v_uid, 0, public.hr_display_name_of(v_uid), v_item, 1, 10, now() + interval '1 day');
    insert into public.market_buy_offers (item_id, qty, max_each) values (v_item, 1, 10);
    insert into public.chat_messages (channel, from_id, from_name, body) values ('global', v_uid, 'x', 'hello');
    perform public.hr_leaderboard_refresh(true);
    if (select name from public.leaderboard_ranked where board = 'wealth' and subject_id = v_uid) <> 'Mallow Probe' then
      raise exception 'GATE(e) CONTROL: the board does not show the claimed name'; end if;

    -- (f) THE MODERATOR'S RENAME.
    v := public.hr_mod_force_rename(v_uid, 'self-check probe');
    v_place := v->>'placeholder';
    if coalesce(v->>'ok', '') <> 'true' or v_place !~ '^Adventurer-[0-9]{4,}$' then
      raise exception 'GATE(f): hr_mod_force_rename answered %', v; end if;
    if not exists (select 1 from public.profiles where id = v_uid and display_name = v_place
                    and name_state = 'flagged' and must_rename)
       or not exists (select 1 from public.display_names where user_id = v_uid and name = v_place) then
      raise exception 'GATE(f): the profile / display_names row was not renamed and flagged'; end if;
    if (select name from public.leaderboard_ranked where board = 'wealth' and subject_id = v_uid)
       is distinct from v_place then
      raise exception 'GATE(f): the leaderboard row does not show the placeholder'; end if;
    if (select count(*) from public.player_ledger where user_id = v_uid and kind = 'moderation_rename'
         and meta->>'old_canon_hash' = md5('mallow probe') and meta->>'reason' = 'self-check probe') <> 1 then
      raise exception 'GATE(f): the moderation_rename ledger row is missing or wrong'; end if;
    if exists (select 1 from public.player_ledger where user_id = v_uid and meta::text ~* 'mallow') then
      raise exception 'GATE(f): the ledger row carries the old name in clear'; end if;
    if (select seller_name from public.market_listings where seller_user_id = v_uid) <> v_place
       or (select buyer_name from public.market_buy_offers where buyer_user_id = v_uid) <> v_place
       or (select from_name from public.chat_messages where from_id = v_uid) <> v_place then
      raise exception 'GATE(f): a stamped copy kept the old name'; end if;
    if public.hr_display_name_of(v_uid) <> v_place
       or coalesce((public.hr_state_of(v_uid, 0)->>'must_rename')::boolean, false) is not true then
      raise exception 'GATE(f): hr_display_name_of / the envelope does not reflect the moderation'; end if;
    -- idempotent replay: no second row
    v := public.hr_mod_force_rename(v_uid, 'self-check probe');
    if coalesce(v->>'already', '') <> 'true'
       or (select count(*) from public.player_ledger where user_id = v_uid and kind = 'moderation_rename') <> 1 then
      raise exception 'GATE(f): a moderator replay was not idempotent: %', v; end if;
    -- the immutability triggers still refuse every OTHER update
    begin
      update public.chat_messages set body = 'edited' where from_id = v_uid;
      raise exception 'GATE(f): chat body became mutable';
    exception when check_violation then null;
    end;
    begin
      update public.market_buy_offers set buyer_name = 'Forged' where buyer_user_id = v_uid;
      raise exception 'GATE(f): an offer accepted a supplied buyer_name';
    exception when insufficient_privilege then null;
    end;

    -- (g) THE HELD NAME (and its variants) CANNOT BE RE-CLAIMED; A NEW ONE CLEARS THE FLAG.
    delete from public.hr_rate_counters;
    v := public.claim_display_name('Mallow_Pr0be');
    if coalesce(v->>'error', '') <> 'name_blocked' then
      raise exception 'GATE(g): the held name came back through a variant: %', v; end if;
    v := public.claim_display_name(v_place);
    if coalesce(v->>'reason', '') <> 'reserved' then
      raise exception 'GATE(g): the player could keep the placeholder: %', v; end if;
    v := public.claim_display_name('Clover Probe');
    if coalesce(v->>'ok', '') <> 'true'
       or not exists (select 1 from public.profiles where id = v_uid and display_name = 'Clover Probe'
                       and name_state = 'ok' and not must_rename)
       or (public.hr_state_of(v_uid, 0)->>'must_rename')::boolean then
      raise exception 'GATE(g): a new claim did not clear must_rename: %', v; end if;

    raise exception using errcode = 'HR971', message = 'name-moderation §13 complete - rolling back';
  exception when sqlstate 'HR971' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- (z) NOTHING LEAKED.
  if exists (select 1 from auth.users where id in (v_uid, v_uid2))
     or exists (select 1 from public.player_ledger where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.hr_name_holds where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.hr_rejections where user_id in (v_uid, v_uid2))
     or exists (select 1 from public.chat_messages where from_id in (v_uid, v_uid2)) then
    raise exception 'GATE(z): §13 LEAKED a probe row'; end if;
  perform public.hr_leaderboard_refresh(true);

  -- (y) THE DETECTOR IS GREEN, strict.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null
       or jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'client_truncate_grants', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(y): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;

  select count(*) into v_n from public.hr_name_blocklist;
  raise notice 'name-moderation: % stems, server-only; EXECUTED - every blocked fixture refused, the '
               'Scunthorpe set passes, direct clan/display_names inserts raise, claim/probe/clan_create '
               'refuse name_blocked (journalled, not echoed), moderator rename renames, flags, holds, '
               'journals once, re-stamps listing/offer/chat and the board, the held name and the '
               'placeholder cannot be claimed, a new claim clears must_rename; detector green - net zero', v_n;
end $$;
