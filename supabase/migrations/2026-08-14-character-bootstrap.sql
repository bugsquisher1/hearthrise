-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CHARACTER BOOTSTRAP  (b338)
--
-- ⚠ REVIEW ONLY — STAGED, NOT APPLIED. Tyler applies.
--
-- APPLY ORDER (both required, in this order, BEFORE this file):
--   1. 2026-08-11-player-state.sql        — already live
--   2. 2026-08-11-catalogue.generated.sql — MUST BE RE-APPLIED. b338 adds
--      hr_start_kit / hr_start_skill_xp / hr_start_inventory /
--      hr_start_equipment to it. §0 below FAILS CLOSED without them.
--   3. THIS FILE
-- Independent of 2026-08-11-apply-engine.sql. Nothing here reads, writes or
-- redefines hr_apply, so this works identically against production's STALE
-- hr_apply (4e76585, 25,966 chars) and against the repo revision. That is
-- deliberate: unblocking character creation must not be entangled with the
-- 47k-char apply-engine transcription problem.
--
-- ════════════════════════════════════════════════════════════════════════
-- WHY THIS FILE EXISTS
--
--   `player_state` has ZERO ROWS. Every accrual call returns `no_character`,
--   so the b337 server-accrual switch cannot be turned on for anybody and the
--   whole server-authority program is stalled behind it.
--
--   The surprising part, found by reading production rather than the repo:
--   **the server-side half already exists and is live.**
--   `hr_create_character(int)` is present, SECURITY DEFINER, VOLATILE,
--   `search_path` pinned, executable by `authenticated` and by nobody else.
--   It has never been called because NOTHING IN THE CLIENT CALLS IT — there
--   is no `hr_create_character` anywhere under `src/`. The blocker was never
--   a missing RPC; it was a missing intent.
--
--   So this file does not invent a creation path. It hardens the one that is
--   already there, on three counts that a live multiplayer server cannot
--   ship without, and the client half (src/net/character.js) supplies the
--   intent.
--
-- ── THE THREE DEFECTS THIS FIXES ────────────────────────────────────────
--
--   D1. CHECK-THEN-INSERT WITH NO LOCK AND NO HANDLER.
--       The live body is:
--           if exists (select 1 from player_state where user_id=… and slot=…)
--             then return slot_taken; end if;
--           insert into player_state …
--       Two tabs, or a retry that overlaps its own predecessor, both evaluate
--       the `exists` as false and both reach the INSERT. The primary key stops
--       the second character — the data is never corrupted — but it stops it
--       with an UNCAUGHT `23505`, which propagates out of the function, aborts
--       the transaction, and reaches the client as an opaque PostgREST 500
--       that is indistinguishable from the server being broken. The player's
--       character DOES exist at that point; the client is told an error.
--       → Fixed with an advisory transaction lock keyed on (user, slot), a
--         re-check under the lock, AND a `unique_violation` handler as a
--         second, independent lock. Proven by fault injection in §4(G).
--
--   D2. `slot_taken` IS THE WRONG VERDICT, AND IT MAKES RETRY UNSAFE.
--       Character creation is IDEMPOTENT BY NATURE: the key is (user_id, slot)
--       and `user_id` comes from `auth.uid()`, so `slot_taken` can only ever
--       mean "you already have a character here". Reporting that as
--       `ok:false` means a client whose success response was lost on the wire
--       cannot tell "I created it and the answer vanished" from "something is
--       wrong", and the only safe behaviour left to it is to give up.
--       → The RPC becomes an ENSURE: `{ok:true, slot, created:<bool>}`.
--         `created` is the honest receipt of which of the two happened.
--
--       NOTE THIS IS WHY THERE IS NO `p_intent_id` PARAMETER. The house
--       idempotency mechanism is `player_intents` + a client-generated uuid
--       (player-state.sql §6b), and it is right for `hr_apply`, where the same
--       delta applied twice is a mint. It is the WRONG tool here: the natural
--       key (user_id, slot) is already unique, already enforced by the PK, and
--       never expires — whereas `hr_intents_prune()` deletes intent rows after
--       24 hours, so a uuid-keyed dedupe would be WEAKER than the constraint
--       that already exists. Adding a parameter would also fork the signature
--       (`create or replace` cannot add one; it would need a drop, which would
--       churn the grant and the A9 hygiene surface) to buy nothing.
--
--   D3. THE STARTING KIT WAS A LITERAL IN PL/pgSQL, AND IT HAD DRIFTED.
--       The live body grants: 15 skill rows, hitpoints at level 10, 4 farm
--       plots, hp 10/10 — and then 0 gold, no equipment and an empty bag.
--       The shipped client's fresh character (src/legacy.js :604-618) has
--       **500 gold, a Bronze Sword in the weapon slot, and 16 items across
--       three stacks**. A server-created character therefore walked into
--       server-side combat accrual with no weapon and no food, and nothing in
--       the repo could see the divergence because the two copies were in
--       different languages in different files.
--       → The kit is now CATALOGUE ROWS generated from `src/data/start-kit.js`
--         by `tools/gen-catalogues.mjs`, which is the house rule ("never
--         duplicate game data into SQL — generate it and add a drift guard").
--         The guard is three-deep and each layer has a different input:
--           · the generator validates the kit against items.js / skills.js /
--             gathering.js and against src/core/xp.js's XP curve — at
--             generation time, in JS;
--           · the generated file re-asserts the same facts against the ROWS
--             THAT LANDED and against the server's own hr_xp_table;
--           · `gen-catalogues.mjs --check` (a preflight in run-smoke.mjs)
--             fails the build if the SQL and the data diverge at all;
--           · smoke test B338-1 asserts legacy.js's fresh-`G` literal still
--             equals `src/data/start-kit.js`.
--
-- ── WHAT THE STARTING STATE IS, AND WHAT THAT CHOICE COSTS ──────────────
-- **FRESH. `game_saves.snapshot` is NEVER read, by anything, ever.**
--
-- The alternative — seeding `player_state` from each player's existing save —
-- is the single most damaging thing that could be built in this program. That
-- blob is CLIENT-AUTHORED; the audit that started all of this found the
-- economy fully exploitable by typing `G.gold = 1e12` into devtools and
-- letting autosave carry it up. Importing it would write forged values into
-- the authoritative tables **permanently and indistinguishably** — there is no
-- sanitiser, because there is no signal in the blob that separates an honest
-- 1e12 from a typed one. Every downstream guarantee (leaderboards, market,
-- clan power) would then rest on data that the model itself classifies as
-- untrusted, and the program would have laundered the exploit instead of
-- closing it.
--
-- THE COST, STATED PLAINLY: the six beta players with a `game_saves` row lose
-- that progress at the moment the server becomes authoritative for them. That
-- cost is real but it is already sunk — **the beta WILL BE WIPED at cutover**
-- (CLAUDE.md, locked 2026-08-10, Tyler explicit), so the progress is going
-- away regardless and the only question was whether it takes a laundering
-- step through the authoritative tables on its way out. It does not.
--
-- ── WHO CREATES THE ROW, AND WHY NOT THE ENGINE ─────────────────────────
-- An EXPLICIT, PLAYER-AUTHENTICATED INTENT. Not auto-creation inside the
-- accrual path, and not a trigger on sign-up. Three reasons, in order of
-- weight:
--
--   1. IT WOULD WIDEN `hr_engine`, WHICH IS THE ONE ROLE THE WHOLE MODEL IS
--      BUILT TO KEEP MINIMAL. The Edge Function runs as `hr_engine`, which
--      holds EXECUTE on a short allowlist — the five the Edge Function calls
--      (`hr_rate_gate`, `hr_state_of`, `hr_offline_cap_ms`, `hr_seed`,
--      `hr_apply`) plus pure XP helpers with no capability of their own — and
--      **zero table privileges in any schema**.
--      (b339: this line said "exactly five" and production holds EIGHT. The
--      three extras are `hr_level_from_xp` / `hr_total_level` /
--      `hr_xp_for_level`, which compute and own nothing, so the SECURITY claim
--      was right and only the NUMBER was wrong — which is worse than it looks,
--      because a future assertion written from this comment would fail
--      spuriously and be "fixed" by loosening it. The allowlist is asserted by
--      `hr_assert_grant_hygiene`, which reads the catalogue rather than a
--      number typed into a comment. Do not restate a count here.)
--      Its entire capability is "propose a delta against a
--      character that already exists", which is precisely the surface
--      `hr_apply` re-validates. Letting the accrual path create characters
--      promotes it to "mint characters", i.e. mint starting kits — 500 gold
--      and a sword per call — which is a value-creating capability handed to
--      the component with the largest attack surface in the system. It is
--      also unnecessary: creation is authenticated by the player's own JWT
--      through `auth.uid()` and needs no engine at all.
--
--   2. `no_character` IS A LOAD-BEARING VERDICT AND AUTO-CREATION DELETES IT.
--      Today an unexpected `no_character` means something is wrong — usually
--      that the client resolved the wrong slot. Auto-vivifying it converts
--      that bug into a SILENT SECOND CHARACTER and shows the player an empty
--      save instead of an error. Fail-closed beats convenient.
--
--   3. Slot choice belongs to the player (src/multi-character.js). A sign-up
--      trigger cannot know it, and a SECURITY DEFINER trigger on `auth.users`
--      is a fragile surface to own inside someone else's managed schema.
--
-- ── VOLATILITY (the b332/A11 lesson, applied BEFORE the fact) ────────────
-- Applying A11 broke sign-up because `beta_invite_check` was declared STABLE
-- and a function two levels beneath it gained a write; PostgREST runs STABLE
-- functions in a read-only transaction and every anonymous call returned
-- 25006. **A volatility declaration is a claim about the whole call tree.**
-- Checked here before writing a line: `hr_create_character` is VOLATILE today
-- and stays VOLATILE (§5(H) asserts `provolatile = 'v'`), and NOTHING ELSE
-- CALLS IT — asserted in §5(K) so that a future caller declared STABLE fails
-- this migration instead of failing a player.
-- ⚠ b339: the ORIGINAL wording of this paragraph said that was "verified
-- against `pg_depend`/`pg_proc` on production". `pg_depend` cannot verify it:
-- a PL/pgSQL body is an opaque string and a call through one creates no
-- dependency edge, so that half of the evidence was a 0 that means nothing.
-- §5(K) now scans `prosrc` and PROVES the scan is sighted before believing it.
-- The functions this body newly reads (`hr_start_kit`
-- and friends) are TABLES, not functions, so no other call tree changes.
--
-- SAFE TO RE-RUN. Additive and idempotent: one `create or replace`, one grant
-- pair, and a self-check that rolls itself back.
-- REVERSIBLE: re-applying 2026-08-11-player-state.sql restores the previous
-- body verbatim. No table, column, constraint or index is added or dropped by
-- this file, so there is nothing else to undo.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ───────────────────────────────────────
-- A missing catalogue must abort, not silently produce kitless characters.
-- "An unknown-item check that silently no-ops is worse than no check, because
-- it reads as a control in review." (Security review S3, player-state.sql.)
do $$
declare t text;
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first';
  end if;
  foreach t in array array['hr_start_kit','hr_start_skill_xp',
                           'hr_start_inventory','hr_start_equipment'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'public.% is missing — RE-APPLY 2026-08-11-catalogue.generated.sql '
        '(regenerate it with `node tools/gen-catalogues.mjs` first; b338 added the starting-kit tables)', t;
    end if;
  end loop;
  if (select count(*) from public.hr_start_kit) <> 1 then
    raise exception 'hr_start_kit holds % rows, expected exactly 1', (select count(*) from public.hr_start_kit);
  end if;
  if (select count(*) from public.hr_skills) = 0 then
    raise exception 'hr_skills is empty — apply 2026-08-11-catalogue.generated.sql';
  end if;
end $$;

-- ── 1. THE ENSURE ────────────────────────────────────────────────────────
create or replace function public.hr_create_character(p_slot int default 0)
returns jsonb language plpgsql security definer set search_path = public as $fn$
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
      (user_id, slot, gold, gems, hearth_tokens, hp, max_hp, bank_cap,
       active_kind, active_id, active_since, accrued_to)
      values (v_uid, v_slot, v_kit.gold, v_kit.gems, v_kit.hearth_tokens,
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

  return jsonb_build_object('ok', true, 'slot', v_slot, 'created', true);
end $fn$;

-- ── 2. GRANTS — revoke from public FIRST, then grant ─────────────────────
-- `create or replace` preserves the existing ACL, so these lines are strictly
-- belt-and-braces. They are here because Supabase's default ACL grants EXECUTE
-- to PUBLIC on every new function, and "it was already correct" is how a gap
-- survives three reviews. Revoke precedes grant, always.
revoke execute on function public.hr_create_character(int) from public, anon, service_role, hr_engine;
grant  execute on function public.hr_create_character(int) to authenticated;

-- ── 3. Volatility, pinned ────────────────────────────────────────────────
-- Structural, not a comment. Same guard shape apply-engine §6(f) uses for
-- hr_state_of and daily-budget uses for hr_day_budget_used. `create or
-- replace` without an explicit `volatile` keeps whatever was there, so this
-- makes the claim explicit rather than inherited.
alter function public.hr_create_character(int) volatile;

-- ════════════════════════════════════════════════════════════════════════
-- 4. SELF-VERIFICATION — BEHAVIOURAL, EXECUTED, AND ROLLED BACK
--
-- This block CALLS the function against a real user inside a subtransaction
-- and rolls the whole thing back. It does not read the source text and it does
-- not assert that objects exist. Nine times this repo has shipped an assertion
-- that asserted nothing; the defence is a CONTROL beside every refusal, so
-- that a function which refused *everything* would fail this block rather
-- than pass it. Every refusal test below has one.
--
-- `apply_migration` / a `begin … commit` wrapper is atomic on this project, so
-- a `raise` here aborts the whole file: this is the commit gate.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_uid   uuid := gen_random_uuid();
  v_r     jsonb;
  v_n     int;
  v_kit   public.hr_start_kit%rowtype;
  v_sqlst text;
begin
  select * into v_kit from public.hr_start_kit;

  begin  -- ── SUBTRANSACTION: everything below is rolled back at the end ──
    -- A throwaway identity. `auth.uid()` on this project reads
    -- `request.jwt.claim.sub` first and falls back to the `request.jwt.claims`
    -- json — and tests/sql/pglite-fixture.sql implements ONLY the former, so
    -- setting that one GUC is what makes this block run identically on
    -- production and on the PGlite chain. `true` = set LOCAL, so it unwinds
    -- with the subtransaction.
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    if auth.uid() is distinct from v_uid then
      raise exception 'SELF-CHECK HARNESS: auth.uid() did not pick up the probe identity — '
                      'every assertion below would have tested not_signed_in instead';
    end if;

    -- (A) CONTROL — the probe starts with nothing. If this were already
    --     non-zero, (B)'s "it created things" would be measuring someone else.
    select count(*) into v_n from public.player_state where user_id = v_uid;
    if v_n <> 0 then raise exception 'A: probe user already has % characters', v_n; end if;

    -- (B) CREATE. The positive case, asserted field by field against the
    --     CATALOGUE rather than against hard-coded numbers — a test that
    --     restates the constants cannot detect the constants being wrong.
    v_r := public.hr_create_character(0);
    if v_r->>'ok' <> 'true' or v_r->>'created' <> 'true' then
      raise exception 'B: first create returned %', v_r;
    end if;

    perform 1 from public.player_state
      where user_id = v_uid and slot = 0
        and gold = v_kit.gold and gems = v_kit.gems and hearth_tokens = 0
        and max_hp = v_kit.max_hp and hp = least(v_kit.hp, v_kit.max_hp)
        and bank_cap = v_kit.bank_cap
        and active_kind = 'idle' and active_id is null
        and version = 0
        and accrued_to <= now() and accrued_to > now() - interval '1 minute';
    if not found then
      raise exception 'B: player_state row does not match hr_start_kit: %',
        (select to_jsonb(s) from public.player_state s where s.user_id = v_uid and s.slot = 0);
    end if;

    -- A row per CATALOGUE skill, not per kit skill.
    select count(*) into v_n from public.player_skills where user_id = v_uid and slot = 0;
    if v_n <> (select count(*) from public.hr_skills) then
      raise exception 'B: % skill rows, hr_skills has %', v_n, (select count(*) from public.hr_skills);
    end if;
    select count(*) into v_n from public.player_skills p
      join public.hr_start_skill_xp k on k.skill_id = p.skill_id and k.xp = p.xp
     where p.user_id = v_uid and p.slot = 0;
    if v_n <> (select count(*) from public.hr_start_skill_xp) then
      raise exception 'B: starting skill XP was not applied (% of % rows match)',
        v_n, (select count(*) from public.hr_start_skill_xp);
    end if;
    -- max_hp must equal the level the granted hitpoints XP buys. This is the
    -- identity that stops the client's render-time derivation from silently
    -- rewriting a server value on the first refresh.
    if v_kit.max_hp <> public.hr_level_from_xp(
         (select xp from public.player_skills where user_id = v_uid and slot = 0 and skill_id = 'hitpoints')) then
      raise exception 'B: max_hp % disagrees with the granted hitpoints level', v_kit.max_hp;
    end if;

    select count(*) into v_n from public.player_inventory i
      join public.hr_start_inventory k on k.item_id = i.item_id and k.qty = i.qty
     where i.user_id = v_uid and i.slot = 0;
    if v_n <> (select count(*) from public.hr_start_inventory)
       or v_n <> (select count(*) from public.player_inventory where user_id = v_uid and slot = 0) then
      raise exception 'B: inventory does not match hr_start_inventory';
    end if;

    select count(*) into v_n from public.player_equipment e
      join public.hr_start_equipment k on k.equip_slot = e.equip_slot and k.item_id = e.item_id
     where e.user_id = v_uid and e.slot = 0;
    if v_n <> (select count(*) from public.hr_start_equipment)
       or v_n <> (select count(*) from public.player_equipment where user_id = v_uid and slot = 0) then
      raise exception 'B: equipment does not match hr_start_equipment';
    end if;
    -- CONSERVATION: the equipped sword must NOT also be in the bag.
    if exists (select 1 from public.player_equipment e
                join public.player_inventory i
                  on i.user_id = e.user_id and i.slot = e.slot and i.item_id = e.item_id
               where e.user_id = v_uid and e.slot = 0
                 and not exists (select 1 from public.hr_start_inventory k where k.item_id = e.item_id)) then
      raise exception 'B: a starting item exists in BOTH equipment and inventory — equip/unequip would duplicate it';
    end if;

    select count(*) into v_n from public.player_farm where user_id = v_uid and slot = 0;
    if v_n <> v_kit.farm_plots then raise exception 'B: % farm plots, kit says %', v_n, v_kit.farm_plots; end if;

    -- ONE ledger row, carrying the gold that entered the economy.
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = 0 and kind = 'admin' and intent = 'create_character';
    if v_n <> 1 then raise exception 'B: % ledger rows for the bootstrap, expected exactly 1', v_n; end if;
    if (select gold from public.player_ledger
         where user_id = v_uid and slot = 0 and intent = 'create_character') is distinct from v_kit.gold then
      raise exception 'B: the ledger did not record the starting gold';
    end if;

    -- (C) IDEMPOTENCE. The same call again must NOT create a second anything.
    v_r := public.hr_create_character(0);
    if v_r->>'ok' <> 'true' or v_r->>'created' <> 'false' then
      raise exception 'C: repeat create returned % (expected ok:true, created:false)', v_r;
    end if;
    select count(*) into v_n from public.player_state where user_id = v_uid;
    if v_n <> 1 then raise exception 'C: % character rows after a repeat call', v_n; end if;
    select count(*) into v_n from public.player_ledger where user_id = v_uid and intent = 'create_character';
    if v_n <> 1 then raise exception 'C: the repeat call journalled again (% rows)', v_n; end if;
    -- ...and it must not have re-granted the kit into the existing character.
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_kit.gold then
      raise exception 'C: the repeat call moved gold';
    end if;

    -- (C-CONTROL) The `created:false` in (C) must be about THIS SLOT being
    --     taken, not about the function having quietly stopped creating.
    --     A different slot, same user, same call — must create.
    v_r := public.hr_create_character(1);
    if v_r->>'ok' <> 'true' or v_r->>'created' <> 'true' then
      raise exception 'C-CONTROL: slot 1 returned % — (C) proves nothing if the function refuses everything', v_r;
    end if;
    select count(*) into v_n from public.player_state where user_id = v_uid;
    if v_n <> 2 then raise exception 'C-CONTROL: % character rows, expected 2', v_n; end if;

    -- (D) SLOT VALIDATION, with its control.
    v_r := public.hr_create_character(6);
    if v_r->>'error' is distinct from 'bad_slot' then raise exception 'D: slot 6 returned %', v_r; end if;
    v_r := public.hr_create_character(-1);
    if v_r->>'error' is distinct from 'bad_slot' then raise exception 'D: slot -1 returned %', v_r; end if;
    v_r := public.hr_create_character(5);          -- CONTROL: the boundary is inclusive
    if v_r->>'ok' <> 'true' or v_r->>'created' <> 'true' then
      raise exception 'D-CONTROL: slot 5 returned % — bad_slot would then be refusing valid slots too', v_r;
    end if;

    -- (E) IDENTITY. No session ⇒ no character, and the control proves the
    --     refusal is about the identity rather than about anything else.
    perform set_config('request.jwt.claim.sub', '', true);
    v_r := public.hr_create_character(3);
    if v_r->>'error' is distinct from 'not_signed_in' then
      raise exception 'E: an anonymous call returned %', v_r;
    end if;
    if exists (select 1 from public.player_state where slot = 3 and user_id = v_uid) then
      raise exception 'E: an anonymous call created a character';
    end if;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(3);          -- CONTROL
    if v_r->>'ok' <> 'true' or v_r->>'created' <> 'true' then
      raise exception 'E-CONTROL: slot 3 returned % once signed in again', v_r;
    end if;

    -- (G) THE RACE, BY FAULT INJECTION.
    --     A true two-session race cannot be run from here (single connection;
    --     this is the standing limitation recorded in the handoff). So the
    --     23505 that a race produces is injected DETERMINISTICALLY at exactly
    --     the point the race would produce it: a BEFORE INSERT trigger that
    --     commits the conflicting row between the function's re-check and its
    --     own INSERT. Without the handler added by this file, that is an
    --     uncaught unique_violation escaping to the client as a 500.
    execute $t$
      create or replace function public.hr_b338_race_probe() returns trigger
      language plpgsql as $body$
      begin
        if coalesce(current_setting('hearthrise.b338_race', true), '') <> 'arm' then return new; end if;
        perform set_config('hearthrise.b338_race', 'fired', true);   -- once only; no recursion
        insert into public.player_state (user_id, slot, hp, max_hp) values (new.user_id, new.slot, 10, 10);
        return new;
      end $body$ $t$;
    execute 'create trigger hr_b338_race_probe before insert on public.player_state '
            'for each row execute function public.hr_b338_race_probe()';

    -- (G-CONTROL) Prove the injector really produces the fault. A raw INSERT
    --     with the trigger armed must raise 23505 — otherwise (G) below would
    --     "pass" against a trigger that does nothing, which is the
    --     always-null-probe failure this whole block is written against.
    delete from public.player_state where user_id = v_uid and slot = 2;
    v_sqlst := null;
    begin
      perform set_config('hearthrise.b338_race', 'arm', true);
      insert into public.player_state (user_id, slot, hp, max_hp) values (v_uid, 2, 10, 10);
    exception when others then v_sqlst := sqlstate;
    end;
    if v_sqlst is distinct from '23505' then
      raise exception 'G-CONTROL: the race injector raised % instead of 23505 — (G) would prove nothing',
        coalesce(v_sqlst, '<no error>');
    end if;
    -- The failed insert unwound its own subtransaction; the slot is still free.
    if exists (select 1 from public.player_state where user_id = v_uid and slot = 2) then
      raise exception 'G-CONTROL: slot 2 is occupied, so (G) would take the fast path instead of racing';
    end if;

    -- (G) The function, hit with the same fault, must return a VERDICT.
    perform set_config('hearthrise.b338_race', 'arm', true);
    v_sqlst := null;
    begin
      v_r := public.hr_create_character(2);
    exception when others then v_sqlst := sqlstate; v_r := null;
    end;
    if v_sqlst is not null then
      raise exception 'G: a lost race escaped as SQLSTATE % instead of a verdict — '
                      'this is the PostgREST 500 the handler exists to prevent', v_sqlst;
    end if;
    if v_r->>'ok' <> 'true' or v_r->>'created' <> 'false' or v_r->>'raced' <> 'true' then
      raise exception 'G: a lost race returned % (expected ok:true, created:false, raced:true)', v_r;
    end if;
    -- THE LOSER CREATED NOTHING. Read this carefully, because the number is
    -- counter-intuitive and the reason is the whole point of the handler.
    -- `exception` opens a SUBTRANSACTION, so catching the 23505 unwinds
    -- everything the losing call did — INCLUDING the row the injector planted,
    -- because the injector ran inside that same subtransaction. Zero is
    -- therefore correct HERE and is an artifact of fault injection: in a real
    -- race the winner's row belongs to a DIFFERENT transaction and is
    -- untouched, which is why the loser's `created:false` is the truth in both
    -- cases. What the count rules out is the failure that matters — a handler
    -- that swallowed the error and carried on would leave a row behind AND
    -- report `created:true`, and (G) above already refused that verdict.
    select count(*) into v_n from public.player_state where user_id = v_uid and slot = 2;
    if v_n <> 0 then
      raise exception 'G: the losing call left % rows behind — it must roll back its own work entirely', v_n;
    end if;
    -- ...and it must not have journalled a bootstrap it did not perform.
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and slot = 2 and intent = 'create_character';
    if v_n <> 0 then raise exception 'G: the losing call journalled % bootstrap rows', v_n; end if;

    perform set_config('hearthrise.b338_race', '', true);
    execute 'drop trigger hr_b338_race_probe on public.player_state';
    execute 'drop function public.hr_b338_race_probe()';

    -- (F) RATE LIMIT, and the thing that actually needed fixing: an ENSURE of
    --     an EXISTING character must never be refused by the CREATION budget.
    --     DELIBERATELY LAST, because it exhausts a budget every test above
    --     depends on — an ordering constraint worth stating, since putting it
    --     earlier makes (G) fail with `rate_limited` and look like a race bug.
    --     Creations so far: slots 0, 1, 5, 3 and the lost race at 2 = five.
    v_r := public.hr_create_character(4);          -- the sixth, and the last allowed
    if v_r->>'created' <> 'true' then raise exception 'F: creation 6 returned %', v_r; end if;
    -- All six slots (0..5) are now used, so a 7th creation is unreachable by
    -- construction — free one so the BUDGET is the thing under test rather than
    -- the slot range. (Direct DML as the migration owner; the client holds no
    -- DELETE on this table, which §5(J) asserts.)
    delete from public.player_state where user_id = v_uid and slot = 4;
    v_r := public.hr_create_character(4);
    if v_r->>'error' is distinct from 'rate_limited' then
      raise exception 'F: the 7th creation in an hour returned % (expected rate_limited)', v_r;
    end if;
    -- THE POINT OF THE TWO-BUCKET SPLIT: with the creation budget exhausted,
    -- ensuring an EXISTING character still succeeds. The pre-b338 body charged
    -- the creation budget on every call, so this returned `rate_limited` and a
    -- real player would have been told their character could not be confirmed.
    v_r := public.hr_create_character(0);
    if v_r->>'ok' <> 'true' or v_r->>'created' <> 'false' then
      raise exception 'F: ensuring an existing character was refused by the CREATION budget: %', v_r;
    end if;

    -- Unwind everything. `raise` is the only way out of a plpgsql
    -- subtransaction that discards its work, and a distinctive SQLSTATE is
    -- what stops this handler from swallowing a genuine assertion failure —
    -- those propagate, abort the file, and nothing is applied.
    raise exception using errcode = 'HR338', message = 'b338 self-check complete — rolling back';
  exception when sqlstate 'HR338' then
    null;
  end;

  -- ROLLBACK PROOF. If the subtransaction had committed, the probe user's rows
  -- would still be here — and this migration would have written a character
  -- into production as a side effect of verifying itself.
  select count(*) into v_n from public.player_state where user_id = v_uid;
  if v_n <> 0 then raise exception 'SELF-CHECK LEAKED % player_state rows', v_n; end if;
  select count(*) into v_n from public.player_ledger where user_id = v_uid;
  if v_n <> 0 then raise exception 'SELF-CHECK LEAKED % ledger rows', v_n; end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception 'SELF-CHECK LEAKED the probe auth.users row';
  end if;
  if to_regproc('public.hr_b338_race_probe') is not null then
    raise exception 'SELF-CHECK LEAKED the race-probe trigger function';
  end if;

  raise notice 'b338 self-check PASSED (create, idempotence, slot bounds, identity, '
               'two-bucket rate split, injected race) and left nothing behind';
end $$;

-- ── 5. STRUCTURAL ASSERTIONS ─────────────────────────────────────────────
-- The behavioural block above proves what the function DOES. These prove the
-- things that are true only in the absence of something, which no call can
-- demonstrate.
do $$
declare v_bad int; v_oid oid; v_ctl int; v_list text; v_scan text;
begin
  v_oid := 'public.hr_create_character(int)'::regprocedure;

  -- (H) VOLATILITY. See the header. A future STABLE declaration here would be
  --     an immediate 25006 on every call, because this function writes.
  if (select provolatile from pg_proc where oid = v_oid) <> 'v' then
    raise exception 'hr_create_character is not VOLATILE — it writes, and PostgREST '
                    'runs a non-volatile function in a read-only transaction (25006)';
  end if;
  if (select prosecdef from pg_proc where oid = v_oid) is not true then
    raise exception 'hr_create_character is not SECURITY DEFINER';
  end if;
  if (select proconfig from pg_proc where oid = v_oid) is null
     or not ((select proconfig from pg_proc where oid = v_oid) && array['search_path=public']) then
    raise exception 'hr_create_character does not pin search_path';
  end if;

  -- (I) THE CLIENT SURFACE. `authenticated` and nobody else — in particular
  --     NOT hr_engine, which is the whole "the engine cannot mint characters"
  --     argument in the header, and NOT anon.
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'authenticated cannot execute hr_create_character — the client intent would 404';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then raise exception 'anon can execute hr_create_character'; end if;
  if has_function_privilege('service_role', v_oid, 'execute') then raise exception 'service_role can execute hr_create_character'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and has_function_privilege('hr_engine', v_oid, 'execute') then
    raise exception 'hr_engine can execute hr_create_character — the accrual engine must not be able to mint characters';
  end if;

  -- (J) THE PROPERTY EVERYTHING ELSE RESTS ON: this RPC is the ONLY way a
  --     player row is written. A write policy or a write grant would make the
  --     starting kit — and every clamp downstream of it — advisory.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('player_state','player_skills','player_inventory',
                       'player_equipment','player_farm','player_progress','player_ledger')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then raise exception '% client write policies on player tables', v_bad; end if;

  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('player_state','player_skills','player_inventory',
                        'player_equipment','player_farm','player_progress','player_ledger')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then raise exception '% client write grants on player tables', v_bad; end if;

  -- (K) NOBODY ELSE CALLS THIS. The A11 outage was caused by a write appearing
  --     beneath a function declared STABLE. Pinning "this has exactly one
  --     caller, and it is over the wire" means a future non-volatile caller
  --     fails HERE instead of failing a player's sign-in.
  --
  --     ⚠ b339 — WHAT THIS ASSERTION USED TO BE, AND WHY IT WAS INSTANCE #13.
  --     It counted `pg_depend` edges from other `pg_proc` rows to this one.
  --     **A PL/pgSQL body is an opaque string to the dependency tracker: a
  --     function→function CALL CREATES NO `pg_depend` EDGE.** Measured on
  --     production while reviewing this very file: `pg_depend` callers of
  --     `hr_rate_ok` = 0, text-scan callers = 6. So the old query returned 0 on
  --     every database that will ever exist — including, precisely, the day
  --     somebody adds the non-VOLATILE caller it was written to catch. It was
  --     an assertion inside the guard that exists BECAUSE of the last assertion
  --     that asserted nothing, and it asserted nothing.
  --
  --     The measurement that can actually see a caller is a `prosrc` scan. But
  --     swapping one blind query for another unproven one is the same mistake
  --     in a new shape, so THE SCAN CARRIES ITS OWN CONTROL: a function that
  --     demonstrably calls this one is PLANTED, the scan must find exactly it,
  --     and only then is the same query trusted to report zero. If the pattern,
  --     the schema filter or `prosrc` itself ever stops working, the control
  --     finds nothing and this migration fails — instead of passing quietly
  --     forever, which is the entire failure mode being closed.
  --
  --     The probe is deliberately declared STABLE: it is the exact shape of the
  --     bug (a non-volatile caller of a writing function), so the control also
  --     demonstrates that the reported volatility is read from a real row.
  --
  --     ONE SCAN TEXT, EXECUTED TWICE — identical BY CONSTRUCTION, not because
  --     two copies remember the same pattern. (The b332 pack-edge lesson: a
  --     property defended by two call sites agreeing is defended by nobody.)
  --     Break the pattern, the schema filter or `prosrc` and the CONTROL run
  --     goes red first, so there is no way to blind the assertion without
  --     blinding its own proof.
  v_scan :=
    'select count(*), string_agg(p.proname || ''/'' || p.provolatile::text, '', '' order by p.proname)'
    '  from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
    ' where n.nspname = ''public'' and p.oid <> $1'
    '   and p.prosrc ~ ''\yhr_create_character\y''';

  execute $probe$
    create function public.hr_b338_caller_probe() returns void
    language plpgsql stable as $p$
    begin
      -- never executed; this body exists to be FOUND by the scan below
      perform public.hr_create_character(0);
    end $p$
  $probe$;

  execute v_scan into v_ctl, v_list using v_oid;
  -- The control asks only "did the scan FIND THE PLANTED BODY, and did it read
  -- its volatility off a real row" — not "did it find exactly one". Anything
  -- else it finds is a genuine caller and belongs to the assertion below, which
  -- reports it by name; making the control exact would have it swallow the very
  -- bug the assertion exists to name.
  if coalesce(v_list, '') !~ '\yhr_b338_caller_probe/s\y' then
    raise exception 'THE CALLER SCAN IS BLIND — a STABLE function that calls hr_create_character '
                    'was planted and the scan reported % caller(s) [%], none of them it. A scan '
                    'that cannot see a known caller cannot see an unknown one, and (K) would pass '
                    'on every database forever (this is exactly how the pg_depend version failed).',
                    v_ctl, coalesce(v_list, '');
  end if;

  drop function public.hr_b338_caller_probe();

  -- THE ASSERTION ITSELF — the SAME scan text, now trusted because the line
  -- above proved it can see failure. A `prosrc` match inside a comment or a
  -- dead branch counts as a caller: that is a false RED that costs one review,
  -- and it is the correct direction to fail.
  execute v_scan into v_bad, v_list using v_oid;
  if v_bad > 0 then
    raise exception 'hr_create_character has % in-database caller(s) [name/provolatile: %] — '
                    'anything other than ''v'' there is the A11 outage waiting to happen '
                    '(PostgREST runs a non-volatile call tree in a read-only transaction, 25006)',
                    v_bad, v_list;
  end if;

  -- The control left nothing behind. Same rule as the behavioural block's
  -- leak checks: a probe that survives its own migration is a new object
  -- nobody reviewed.
  if to_regproc('public.hr_b338_caller_probe') is not null then
    raise exception 'STRUCTURAL CHECK LEAKED the caller probe';
  end if;

  raise notice 'b338 structural assertions PASSED (caller scan proven sighted, then zero)';
end $$;
