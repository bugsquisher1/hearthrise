-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-10-dungeon-scrip.sql — DUNGEON SCRIP becomes SERVER-OF-RECORD.
--                                (§1 of docs/design/dungeon-settlement.md)
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (execute_sql wrapped in begin/commit, or a Supabase branch apply) after
--     the security review. It is a PROGRESSION-CURRENCY surface (it adds the
--     server-owned scrip balance and projects it into the state envelope).
--
--   Companion catalogue: 2026-09-10-dungeon-catalogue.generated.sql
--   Companion RPC:       2026-09-10-dungeon-settle.sql (the WRITER; inert until it)
--   Companion client:    src/dungeons.js / src/dungeon-scavenger.js (read scrip
--                        from the envelope, stop minting it)
--   Companion test:      tests/dungeon-settle.mjs (PGlite replay + mutation proof)
--
-- ⚠ AFTER APPLYING: hr_state_of is a LIVE-HASH-TRACKED body
--   (tests/live-hash-drift.baseline.json). This file patches it PROGRAMMATICALLY
--   (pg_get_functiondef + a guarded, exactly-once anchor replace), so the
--   Coordinator must re-seed the baseline with
--   `node tests/live-hash-drift.mjs --live --write` after the apply, or the next
--   drift run reports a false divergence. IT TAKES OVER NO LAST-TOUCHER ROLE —
--   it carries no literal `create or replace function public.hr_state_of(` header
--   and is a member of NO derivation chain.
--
-- ── WHAT THIS DOES, AND WHY ─────────────────────────────────────────────────
-- Dungeon Scrip is a fungible currency spent at ONE shop (the Quartermaster),
-- never equipped, never traded — the exact shape of `marks` (a bounty currency
-- spent at a shop), which already lives as `player_state.marks bigint default 0`,
-- is credited by an RPC, and is projected in hr_state_of (2026-08-26-marks-
-- record.sql). This file gives scrip the same home:
--   (1) player_state.dungeon_scrip bigint not null default 0
--   (2) hr_state_of projects it, flat, beside marks — so src/net/record.js reads
--       it the SAME way it reads gold/marks, and a moved-but-UNKNOWN scrip balance
--       renders a pending glyph, never a forgeable local number.
--
-- Rationale for the column and NOT an inventory item / residue mirror is decided
-- in docs/design/dungeon-settlement.md §1 (an item fragments the item model and
-- inherits bank-cap/stacking semantics meaningless for a currency; a residue
-- mirror is client-authored and devtools-forgeable — REJECTED).
--
-- ── INERT ON ITS OWN ────────────────────────────────────────────────────────
-- This file adds a column and one projected key. NOTHING WRITES the column until
-- hr_dungeon_settle (2026-09-10-dungeon-settle.sql) lands, so it is the safest
-- first apply and does nothing observable to a player until the writer + client
-- read ship. It is applied first precisely because it is inert.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive. To revert: re-apply the current last-toucher of hr_state_of
-- (2026-09-08-hero-slot-buy.sql restores the projection without dungeon_scrip —
-- an old client ignores the extra key) and, only once no writer remains,
-- `alter table public.player_state drop column dungeon_scrip`. The column's
-- default 0 means an un-patched hr_state_of that never referenced it is harmless.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_def text;
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;

  -- The body we are about to PATCH must carry the marks projection — the anchor
  -- this file splices next to. Fail closed rather than patch a body whose shape
  -- this file cannot account for (the b484–b487 revert class).
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if position('''marks'', v_st.marks' in v_def) = 0 then
    raise exception 'the LIVE hr_state_of does not project marks — apply '
                    '2026-08-26-marks-record.sql first; this file splices dungeon_scrip beside it';
  end if;
end $$;

-- ── 1. THE COLUMN — mirrors player_state.marks byte-for-byte in shape ───────
-- bigint, NOT NULL, default 0. `add column if not exists` is idempotent and,
-- because of the default, every existing row is backfilled to 0 in one catalogue
-- update. No client write grant is added: player_state has exactly one policy
-- (SELECT where auth.uid()=user_id) and no client write grant, and adding a
-- column does not change that — §3 asserts it.
alter table public.player_state add column if not exists dungeon_scrip bigint not null default 0;

-- ── 2. hr_state_of — PROJECT dungeon_scrip (programmatic, additive) ────────
-- pg_get_functiondef + a guarded exactly-once anchor replace (the
-- 2026-09-08-hero-slot-buy.sql §7 / 2026-09-03-intent-mismatch-class.sql idiom),
-- so this file never restates a body it did not author and can never silently
-- delete another file's projection (the workers/hero_slots/marks lines).
-- Anchored on the marks projection, so scrip lands INSIDE the `state` object
-- beside the other flat scalar currencies — read by the accrual shell / record.js
-- exactly as marks is.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'marks', v_st.marks,$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if v_def is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;
  if strpos(v_def, $q$'dungeon_scrip', v_st.dungeon_scrip$q$) > 0 then
    raise notice 'hr_state_of already projects dungeon_scrip — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of marks anchor did not match exactly once — its shape is '
                    'not the one this file was derived against. Do NOT patch a body you cannot '
                    'account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || '
      -- dungeon-scrip: the server-owned Dungeon Scrip currency, credited by
      -- hr_dungeon_settle. Flat scalar beside marks so src/net/record.js reads it
      -- the SAME way it reads gold/marks — a moved-but-UNKNOWN scrip balance
      -- renders a pending glyph, never a forgeable local number. Never an
      -- inventory item, never a residue mirror (dungeon-settlement.md §1).
      ''dungeon_scrip'', v_st.dungeon_scrip,');
  execute v_def;
  raise notice 'hr_state_of patched: projects player_state.dungeon_scrip beside marks';
end $$;
-- create-or-replace preserves an ACL, but be explicit (the lesson of every
-- restated body in this tree). hr_state_of takes an arbitrary uuid; no client.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. Apply is atomic, so a
-- raise reverts everything above. The row-writing probe lives in a subtransaction
-- discarded by a sentinel raise (HR819) so this block is net-zero on production.
do $$
declare
  v_st   jsonb;
  v_def  text;
  v_uid  constant uuid := '000000d5-0000-0000-0000-0000000000d5';
  v_slot constant int := 0;
begin
  -- (a) THE COLUMN exists, bigint, not null, default 0.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state'
         and column_name='dungeon_scrip' and data_type='bigint' and is_nullable='NO') <> 1 then
    raise exception 'GATE(a): player_state.dungeon_scrip is not a NOT NULL bigint';
  end if;

  -- (b) hr_state_of PROJECTS dungeon_scrip AND still projects marks (the anchor
  --     must not have been consumed) — a positive control on the splice.
  select prosrc into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_state_of';
  if position('''dungeon_scrip'', v_st.dungeon_scrip' in v_def) = 0 then
    raise exception 'GATE(b): hr_state_of does not project dungeon_scrip'; end if;
  if position('''marks'', v_st.marks' in v_def) = 0 then
    raise exception 'GATE(b): the dungeon_scrip splice DROPPED the marks projection — chain broken';
  end if;

  -- (c) NO CLIENT WRITE on player_state — RLS only, no non-SELECT grant.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_state'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(c): a client write grant exists on player_state — scrip is client-forgeable';
  end if;

  -- (d) EXECUTED — hr_state_of returns the scrip balance, in a discarded subtxn.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
      values (v_uid, v_slot, 0, 0, 137, 1)
      on conflict (user_id, slot) do update set dungeon_scrip = 137, version = 1;
    v_st := public.hr_state_of(v_uid, v_slot);
    if (v_st->'state'->>'dungeon_scrip')::bigint <> 137 then
      raise exception 'GATE(d): hr_state_of dungeon_scrip = % (expected 137)',
        v_st->'state'->>'dungeon_scrip'; end if;
    -- and it did not disturb marks.
    if (v_st->'state'->>'marks') is null then
      raise exception 'GATE(d): hr_state_of no longer returns marks'; end if;
    raise exception using errcode = 'HR819', message = 'dungeon-scrip §3 complete — rolling back';
  exception when sqlstate 'HR819' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id=v_uid)
     or exists (select 1 from auth.users where id=v_uid) then
    raise exception 'GATE: §3 LEAKED a probe row'; end if;

  raise notice 'dungeon-scrip: player_state.dungeon_scrip added (NOT NULL bigint default 0), '
               'hr_state_of projects it beside marks, no client write on player_state — all green';
end $$;
