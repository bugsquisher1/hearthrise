-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-13-buff-cellar-scale.sql — THE CELLAR FINALLY PAYS, AND THE SERVER
--                                    IS THE ONLY THING THAT COMPUTES IT.
--
-- Buffs step 3. Steps 1-2 (consumable-buffs / apply-coupling / segments /
-- shape-code / segments-predicate) moved the buff CLOCK onto the server. This
-- file makes the buff SCALE server-owned too.
--
-- ── THE DEFECT, AS SHIPPED ──────────────────────────────────────────────────
-- src/legacy.js ROOMS.cellar has sold five rungs since long before the cutover:
--     Root Cellar   "Food buffs last +20% longer"   bk:'buffDuration' bv:.20
--     Stone Cellar  +40%   ·  The Vault +60%  ·  The Cask Room +80%
--     The Deep Cellar "+100% longer"                                 bv:1.00
-- and the SERVER paid none of it. hr_apply carried
--     c_buff_scale  constant numeric := 1;   -- duration multiplier (perk hook; 1 today)
-- so a player who spent 320,000 gold and two keystones on The Deep Cellar got a
-- ten-minute Fisher's Pie exactly as long as a player who owns no Cellar at all.
-- The only place the bonus was ever applied was src/features/homestead.js:1312,
-- a CLIENT getBonus() read used for a label — which is the residue-ahead class
-- stated in CLAUDE.md §6: the client shows a capability the server does not
-- honour. It is also the reason this cannot be fixed on the client: there is no
-- client-side buff clock left to lengthen. `until` is stamped in hr_apply.
--
-- ── THE LADDER AND THE FORMULA ──────────────────────────────────────────────
-- Designer authority for this lane; the ruling is TO CHANGE NO NUMBER. The
-- ladder is the one the shop already sells, and the server now pays exactly it:
--
--     rung   1     2     3     4     5
--     bonus  +20%  +40%  +60%  +80%  +100%        (ROOM_PERKS.cellar.buffDuration)
--
--     bonus   = max(buffDuration) over hr_room_perks rows for 'cellar'
--               with level <= the rung the character owns          (0 if none)
--     scale   = least(1 + bonus, c_buff_scale_max)                 c_buff_scale_max = 2.0
--     until   = least(base + duration_ms * scale, now() + c_buff_max_ms)
--
-- `max over level <= owned` rather than an exact-level lookup is deliberate: a
-- rung payload REPLACES the rung below it (getBonus reads `levels[lv-1]`), the
-- generator proves the cellar ladder is non-decreasing and contiguous, and this
-- form additionally CLAMPS a stored rung that is above the ladder — a row that
-- says level 9 pays level 5, never an exception on the write path.
--
-- The cap is a FUSE, not a balance number: it equals the top rung today, so it
-- binds on nothing that exists and bounds anything a future perk stack (a clan
-- perk, a Feast Mastery) could add without this body being re-reviewed. And the
-- 60-minute ceiling (c_buff_max_ms) is applied AFTER the scale, unchanged, so
-- the worst case a Deep Cellar can produce is a 10-minute Feast lasting 20
-- minutes, and no queue tail can be pushed past now()+60min by any rung.
--
-- ── WHY IT IS READ HERE AND NOT PASSED IN ───────────────────────────────────
-- The Edge Function PROPOSES; Postgres DECIDES. `buff_apply` admits exactly one
-- key — `item` — and every other key is refused `bad_buff_shape`/forbidden_key
-- by the check 2026-09-13-consumable-buffs.sql installed. `scale` is therefore
-- unforgeable BY THE SHAPE, not by a branch somebody remembered to write, and
-- §4(f) fires a forged `scale` at the live body as a positive control rather
-- than trusting that reading.
--
-- ── WHY hr_unlock_levels AND NOT hr_perks_of ────────────────────────────────
-- hr_perks_of is the perk ENVELOPE for the accrual engine and it is expensive:
-- it aggregates renown (hr_renown_of scans skills, bestiary, kills, collection)
-- and projects the recipe gate. None of that is a buff duration, and this read
-- happens while the character row is LOCKED, on the single write path of the
-- economy. hr_unlock_levels is the function hr_perks_of ITSELF uses to build its
-- `rooms` key, so reading it here creates NO third truth: one filtered index
-- lookup on player_progress joined to hr_unlocks, plus one primary-key probe on
-- hr_room_perks. Both are owner-only (SECURITY DEFINER, revoked from every
-- client role including hr_engine), and hr_apply runs as the owner.
--
-- ── WHAT THE ENVELOPE GAINS, AND WHAT IT DOES NOT MEAN ──────────────────────
-- Each element of the top-level `buffs` projection gains `scale`, so Active
-- Effects can say "+100% from the Cellar" instead of a player having to trust
-- that a number they cannot see was applied. It is DISPLAY ONLY:
--   · src/core/buffs.js buffQueueFromServer ignores unknown fields, so the away
--     engine's input is byte-identical and AWAY-1 parity is untouched;
--   · nothing multiplies by it anywhere — the duration it bought is already
--     inside `until`, and multiplying again would pay the Cellar twice;
--   · a segment written before this file has no `scale` key and projects 1.0.
--   · HONEST LIMITATION, stated: `scale` describes the STAMPING that last wrote
--     the segment. A same-magnitude re-eat extends one segment (the twin rule),
--     so a player who built the Cellar between two helpings sees the newer
--     scale on a segment whose first helping was stamped at the old one. The
--     alternative — splitting a segment per scale — would burn the segment
--     budget to annotate a label, which is the wrong trade.
--
-- ── JOURNALLED, WITHOUT A NEW ROW ───────────────────────────────────────────
-- The per-apply ledger summary gains `bs` = the scale used, and ONLY when it is
-- not 1.0 (jsonb_strip_nulls drops it otherwise). No ledger row per buff: one
-- row per eaten pie is the game_events mistake — 1.6M rows / 229 MB from six
-- players in four days — repeated at ledger scale. So "how long was this buff,
-- and why" is answerable from the append-only journal for every apply that used
-- a perk, at a cost of ~10 bytes on the rows that used one.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- New client-reachable input: NONE. The delta shape is unchanged and still
-- one-key. The new inputs are two server tables the client cannot write
-- (player_progress rows are minted only by hr_apply's unlock arm and
-- hr_unlock_guard; hr_room_perks is SELECT-only for every client role, asserted
-- in the generated file and again in §4(a)). The only new way to lengthen a
-- buff is to BUY a Cellar rung with gold and materials through the unlock path
-- that already exists, which is the intended faucet.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- Per MANUAL eat only (auto-eat does not buff): +2 index probes inside a lock
-- that is already held, and no extra round trip. At 600 players eating, say, 20
-- buff foods a day that is 24,000 extra probes/day — noise beside the settle
-- traffic on the same rows. Storage: one jsonb number per stamped segment
-- (~14 bytes on a queue the CHECK already bounds at 256 entries), plus `bs` on
-- the ledger rows of applies that actually used a perk. No new table, index,
-- constraint, grant, policy, publication or cron job in THIS file.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive and idempotent; §0 returns a notice if the scale is already in the
-- body. To undo: patch `v_buff_scale` back to `c_buff_scale` in the two
-- expressions (or restate hr_apply from the repo replay) and drop `'scale'` from
-- the hr_state_of projection. No data is altered, no row deleted, no grant or
-- policy changed, and a segment stamped under the scale keeps the `until` it was
-- honestly granted — reverting takes the multiplier away from FUTURE consumes,
-- never retroactively shortens a buff a player is currently running.
--
-- RESTATEMENT-DEBT-ACK: six anchored replacements inside the LIVE hr_apply and
--   hr_state_of bodies, whose chains are far past the depth rule. A restatement
--   is the worse option HERE and the reason is specific, not a formality: the
--   live hr_apply body an agent cannot read (tools/apply-migration.mjs and
--   tests/live-hash-drift.baseline.json are Coordinator-only) is ~2,500 lines
--   assembled from patches by many lanes, several of them today's, and
--   re-stating it from the repo replay would blind-overwrite any patch this
--   branch has not seen on the economy's single write path — the b484-b487
--   class. Every anchor below is asserted to match EXACTLY ONCE and the file
--   raises rather than patching blind. Paydown (a restatement of hr_apply) stays
--   the Coordinator's, scheduled with slice 7.
--
-- ⚠ AFTER APPLYING: hr_apply and hr_state_of are both LIVE-HASH-TRACKED. Re-seed
--   with `node tests/live-hash-drift.mjs --live --write` and write the whys from
--   `--codediff`; the expected diff is exactly the six regions below.
-- ⚠ APPLY ORDER: LAST, after 2026-09-13-room-perks-catalogue.generated.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, AND RE-ENTRANT ─────────────────────────
do $mig$
declare v_apply text;
begin
  if to_regclass('public.hr_room_perks') is null then
    raise exception 'hr_room_perks is missing — apply '
                    '2026-09-13-room-perks-catalogue.generated.sql first; there would be nothing to '
                    'price the Cellar from and every buff would silently stay at scale 1.0';
  end if;
  if not exists (select 1 from public.hr_room_perks
                  where room_id = 'cellar' and (perks->>'buffDuration') is not null) then
    raise exception 'hr_room_perks holds no cellar rung with a buffDuration — the catalogue is present '
                    'but EMPTY of the one fact this file reads, which is the always-null probe';
  end if;
  if to_regprocedure('public.hr_unlock_levels(uuid,int)') is null then
    raise exception 'hr_unlock_levels is missing — apply 2026-08-16-artisan-progress-model.sql first';
  end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply is missing — apply the apply-engine chain first';
  end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_apply, 'c_buff_max_segments') = 0 then
    raise exception 'hr_apply does not carry the segment model — apply the buffs step-1/2 chain first';
  end if;
end $mig$;

-- ── 1. hr_apply — THE SCALE IS READ FROM THE PLAYER'S OWN PERKS ────────────
do $mig$
declare
  v_def text;
  -- (1) the declare block: the fuse and the three new locals.
  c_a1 constant text :=
$anc$  c_buff_scale  constant numeric := 1;         -- duration multiplier (perk hook; 1 today)$anc$;
  c_b1 constant text :=
$anc$  c_buff_scale  constant numeric := 1;         -- the BASE multiplier, before any perk
  -- ⚠ THE FUSE ON THE PERK STACK (2026-09-13 step 3). The Cellar's top rung sells
  --   +100%, so this binds on nothing that exists today — which is exactly when a
  --   ceiling should be written. It bounds anything a future perk (a clan bonus, a
  --   Feast Mastery) can add to a duration WITHOUT this body being re-reviewed,
  --   and it is applied before the 60-minute expiry cap rather than instead of it.
  c_buff_scale_max constant numeric := 2;      -- no perk stack may more than double a buff
  v_buff_rung   int;
  v_buff_bonus  numeric;
  v_buff_scale  numeric;$anc$;
  -- (2) the minimum-gain fuse, measured against the SCALED duration — and the
  --     direction is the opposite of what an earlier draft of this line claimed
  --     (Security, 2026-09-13). need = duration x scale x 0.10 is LARGER under a
  --     rung, so a Deep Cellar owner is refused buff_at_max EARLIER as the queue
  --     approaches the 60-minute ceiling, not later. That is the intent: the fuse
  --     is "a consume must buy a meaningful share of what it promises", and a
  --     Deep Cellar is promised twice as much, so the threshold has to scale with
  --     the promise or the refusal would mean something different for two players
  --     eating the same pie. The cost of the earlier refusal is nothing — the food
  --     is NOT spent — and the alternative (an unscaled need) would let a perked
  --     player pay a whole Feast for 90 seconds of tail.
  c_a2 constant text :=
$anc$      v_buff_gain := greatest(0, floor(extract(epoch from (v_buff_cap - v_buff_base)) * 1000))::bigint;
      v_buff_need := ceil((v_buff_dur * c_buff_scale) * c_buff_min_gain_frac)::bigint;$anc$;
  c_b2 constant text :=
$anc$      -- ── THE CELLAR (2026-09-13 step 3) ───────────────────────────────────
      -- The duration multiplier this character has EARNED, read here, inside the
      -- lock, from the server's own rows. There is no delta key for it: the shape
      -- check above admits `item` and nothing else, so a caller that invents
      -- `scale` is refused bad_buff_shape before this line is reached.
      --
      -- hr_unlock_levels is the SAME source hr_perks_of builds its `rooms` key
      -- from, so this is not a third truth about what a character owns; it is read
      -- directly rather than through hr_perks_of because that function also
      -- aggregates renown and the recipe gate, none of which is a buff duration,
      -- and this runs on the write path with the row locked.
      select coalesce(max(u.level), 0) into v_buff_rung
        from public.hr_unlock_levels(v_uid, v_slot) u
       where u.unlock_id = 'room:cellar';
      -- `level <= the rung owned`, max: a rung payload REPLACES the rung below it,
      -- the catalogue proves the cellar ladder is contiguous and non-decreasing,
      -- and this form CLAMPS a stored rung above the ladder instead of raising on
      -- the write path. No row, no cellar, no bonus — 0, never null.
      select coalesce(max((rp.perks->>'buffDuration')::numeric), 0) into v_buff_bonus
        from public.hr_room_perks rp
       where rp.room_id = 'cellar' and rp.level <= v_buff_rung;
      -- The fuse, and the floor: a perk may only ever LENGTHEN a buff, so a
      -- negative or absent bonus can never shorten one below the catalogue value.
      v_buff_scale := least(greatest(c_buff_scale * (1 + coalesce(v_buff_bonus, 0)),
                                     c_buff_scale), c_buff_scale_max);
      v_buff_gain := greatest(0, floor(extract(epoch from (v_buff_cap - v_buff_base)) * 1000))::bigint;
      v_buff_need := ceil((v_buff_dur * v_buff_scale) * c_buff_min_gain_frac)::bigint;$anc$;
  -- (3) the expiry itself.
  c_a3 constant text :=
$anc$      v_buff_until := least(v_buff_base
                              + make_interval(secs => (v_buff_dur * c_buff_scale) / 1000.0),
                            v_buff_cap);$anc$;
  c_b3 constant text :=
$anc$      -- THE SCALED EXPIRY. The 60-minute ceiling is applied AFTER the scale and is
      -- unchanged by it: a perk lengthens what a consume BUYS, it never raises the
      -- ceiling a queue may stand on.
      v_buff_until := least(v_buff_base
                              + make_interval(secs => (v_buff_dur * v_buff_scale) / 1000.0),
                            v_buff_cap);$anc$;
  -- (4) the segment carries the scale it was stamped with.
  c_a4 constant text :=
$anc$      v_buffs_new := v_buffs_new || jsonb_build_array(jsonb_build_object(
        'type', v_buff_type,
        'magnitude', v_buff_newmag,
        'until', to_jsonb(v_buff_until)));$anc$;
  c_b4 constant text :=
$anc$      -- `scale` is carried on the segment so the player can be TOLD why their buff
      -- is long ("+100% from the Cellar") instead of having to trust a number they
      -- cannot see. It is DISPLAY ONLY: the duration it bought is already inside
      -- `until`, src/core/buffs.js ignores unknown fields, and nothing multiplies
      -- by it — doing so would pay the Cellar twice.
      v_buffs_new := v_buffs_new || jsonb_build_array(jsonb_build_object(
        'type', v_buff_type,
        'magnitude', v_buff_newmag,
        'until', to_jsonb(v_buff_until),
        'scale', to_jsonb(v_buff_scale)));$anc$;
  -- (5) the journal. No new row — one FIELD on the row this apply already writes.
  c_a5 constant text :=
$anc$      'e',  case when p_delta ? 'equip' then p_delta->'equip' end,$anc$;
  c_b5 constant text :=
$anc$      'e',  case when p_delta ? 'equip' then p_delta->'equip' end,
      -- THE BUFF SCALE THAT WAS USED, and only when a perk actually moved it
      -- (jsonb_strip_nulls drops the 1.0 case). NOT a new ledger row: one row per
      -- eaten pie is the game_events mistake — 1.6M rows / 229 MB, six players,
      -- four days — repeated at ledger scale. This makes "why was that buff long"
      -- answerable from the append-only journal for ~10 bytes on the applies that
      -- used a perk, and zero on the ones that did not.
      'bs', case when p_delta ? 'buff_apply' and coalesce(v_buff_scale, 1) <> 1
                 then to_jsonb(v_buff_scale) end,$anc$;
  v_n int;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  -- RE-ENTRANT: already installed is a notice, not a failure.
  if strpos(v_def, 'v_buff_scale') > 0 then
    raise notice 'hr_apply already prices the Cellar into a buff — patch skipped';
    return;
  end if;

  -- EVERY ANCHOR, EXACTLY ONCE, BEFORE ANYTHING IS REPLACED. A patch that
  -- anchors on a body it cannot account for is the failure mode this whole
  -- technique dies of, and a no-op replace is SILENT.
  v_n := (length(v_def) - length(replace(v_def, c_a1, ''))) / nullif(length(c_a1), 0);
  if v_n <> 1 then raise exception 'cellar-scale: anchor (1) the declare block matched % times', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, c_a2, ''))) / nullif(length(c_a2), 0);
  if v_n <> 1 then raise exception 'cellar-scale: anchor (2) the minimum-gain fuse matched % times', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, c_a3, ''))) / nullif(length(c_a3), 0);
  if v_n <> 1 then raise exception 'cellar-scale: anchor (3) the expiry matched % times', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, c_a4, ''))) / nullif(length(c_a4), 0);
  if v_n <> 1 then raise exception 'cellar-scale: anchor (4) the segment build matched % times', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, c_a5, ''))) / nullif(length(c_a5), 0);
  if v_n <> 1 then raise exception 'cellar-scale: anchor (5) the ledger meta matched % times', v_n; end if;

  v_def := replace(v_def, c_a1, c_b1);
  v_def := replace(v_def, c_a2, c_b2);
  v_def := replace(v_def, c_a3, c_b3);
  v_def := replace(v_def, c_a4, c_b4);
  v_def := replace(v_def, c_a5, c_b5);
  execute v_def;
  raise notice 'hr_apply patched: a buff is stamped with the duration the player''s Cellar earned';
end $mig$;
-- create-or-replace preserves an ACL; re-state it anyway (the repo convention).
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 2. hr_state_of — THE ENVELOPE SAYS WHY THE BUFF IS LONG ────────────────
do $mig$
declare
  v_def text;
  v_n int;
  -- ⚠ THE ANCHOR IS THE `until` LINE ALONE, deliberately. The obvious anchor —
  --   this line PLUS the `remaining_ms` expression under it — would be pinning
  --   text this file does not own, and tests/buff-queue.mjs's `remaining_ms_dead`
  --   mutation rewrites exactly that expression: the anchor would match zero
  --   times, the chain would refuse, and a mutation would score HARNESS instead
  --   of the tick it earned (MEASURED on this branch). Anchor on what you are
  --   inserting next to, never on your neighbour's body.
  c_a constant text :=
$anc$               'until', e.v->>'until',$anc$;
  c_b constant text :=
$anc$               'until', e.v->>'until',
               -- THE PERK MULTIPLIER THIS SEGMENT WAS STAMPED WITH (step 3).
               -- Display only — the time it bought is already in `until`, and a
               -- segment written before the Cellar was priced has no key and is
               -- honestly 1.0 rather than absent, because an absent number is one
               -- a renderer has to guess at.
               'scale', coalesce((e.v->>'scale')::numeric, 1),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'scale', coalesce((e.v->>'scale')$q$) > 0 then
    raise notice 'hr_state_of already projects the buff scale — patch skipped'; return; end if;
  if strpos(v_def, $q$'buffs', coalesce($q$) = 0 then
    raise exception 'hr_state_of does not project buffs — apply 2026-09-13-consumable-buffs.sql first';
  end if;
  v_n := (length(v_def) - length(replace(v_def, c_a, ''))) / nullif(length(c_a), 0);
  if v_n <> 1 then
    raise exception 'cellar-scale: the hr_state_of buff-projection anchor matched % times — its shape is '
                    'not the one this file was derived against. Do NOT patch a body you cannot account '
                    'for.', v_n;
  end if;
  v_def := replace(v_def, c_a, c_b);
  execute v_def;
  raise notice 'hr_state_of patched: every buff element carries the scale it was stamped with';
end $mig$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. SELF-CHECK (§4) — BY EXECUTION, WITH CONTROLS ───────────────────────
-- Driven against a fabricated character inside a subtransaction discarded by a
-- sentinel raise (HR831), so this block is NET-ZERO on production and the leak
-- check afterwards says so rather than assuming it.
--
-- The arms, and what each would catch:
--   (a) the text that must be there, the predecessors that must still be there,
--       and no client role on hr_apply / hr_state_of / hr_room_perks.
--   (b) NEGATIVE CONTROL — no Cellar ⇒ scale 1.0 and the catalogue duration.
--       Without it, a file that simply doubled every buff would pass (c).
--   (c) THE RAISED CASE — the top rung ⇒ scale 2.0 and a duration twice (b)'s,
--       measured against (b)'s own number rather than a literal.
--   (d) EVERY RUNG PAYS ITS OWN NUMBER — 1.2/1.4/1.6/1.8/2.0, so a body that
--       read `owned > 0 ? max : 1` is caught.
--   (e) THE 60-MINUTE CEILING STILL BINDS under the top rung.
--   (f) FORGED SCALE IS REFUSED — the client cannot send one (bad_buff_shape),
--       and the queue and the bag are unmoved.
--   (g) THE JOURNAL carries `bs` when a perk moved it and NOT when it did not,
--       with no extra ledger row.
--   (h) THE ENVELOPE carries `scale`, and a pre-scale segment projects 1.0.
do $mig$
declare
  v_apply text; v_state text; v_r jsonb; v_ver bigint; v_q jsonb; v_env jsonb;
  v_item text; v_type text; v_mag numeric; v_dur bigint;
  v_base_ms numeric; v_ms numeric; v_rows int; v_qty int; v_meta jsonb;
  v_lvl int; v_want numeric; v_led_hi bigint;
  v_uid  constant uuid := '000000c5-0000-0000-0000-0000000000c5';
  c_j    constant jsonb := '{"kind":"admin","intent":"cellar-scale:probe"}'::jsonb;
begin
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_state := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');

  -- ── (a) THE TEXT, AND THE PREDECESSORS ────────────────────────────────────
  if strpos(v_apply, 'c_buff_scale_max constant numeric := 2;') = 0
     or strpos(v_apply, $q$where u.unlock_id = 'room:cellar'$q$) = 0
     or strpos(v_apply, 'public.hr_room_perks rp') = 0 then
    raise exception 'cellar-scale self-check (a): the perk read is not installed';
  end if;
  if strpos(v_apply, 'v_buff_dur * c_buff_scale') > 0 then
    raise exception 'cellar-scale self-check (a): an expression still multiplies by the CONSTANT — a '
                    'rung would be bought and never paid';
  end if;
  if strpos(v_apply, $q$'scale', to_jsonb(v_buff_scale)$q$) = 0 then
    raise exception 'cellar-scale self-check (a): the segment does not carry its scale'; end if;
  if strpos(v_apply, $q$'bs', case when p_delta ? 'buff_apply'$q$) = 0 then
    raise exception 'cellar-scale self-check (a): the scale is not journalled'; end if;
  -- …and every predecessor block this patch must not have eaten.
  if strpos(v_apply, 'buff_not_paid') = 0
     or strpos(v_apply, $q$where t.bk <> 'item'$q$) = 0
     or strpos(v_apply, 'bad_buff_shape') = 0
     or strpos(v_apply, 'c_buff_max_segments constant int := 8;') = 0
     or strpos(v_apply, 'v_buff_gain < v_buff_need') = 0
     or strpos(v_apply, 'v_out := public.hr_state_of(v_uid, v_slot);') = 0 then
    raise exception 'cellar-scale self-check (a): the patch was not additive — a predecessor block is gone';
  end if;
  if strpos(v_state, $q$'scale', coalesce((e.v->>'scale')::numeric, 1)$q$) = 0
     or strpos(v_state, $q$'remaining_ms'$q$) = 0 then
    raise exception 'cellar-scale self-check (a): the envelope projection is wrong';
  end if;
  -- REACHABILITY. Without this every assertion below is decoration.
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'cellar-scale self-check (a): a client role can execute the engine';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'hr_room_perks'
                and grantee in ('anon','authenticated','service_role','PUBLIC')
                and privilege_type <> 'SELECT') then
    raise exception 'cellar-scale self-check (a): a client role can WRITE the perk catalogue — the '
                    'scale would be forgeable through the table instead of the delta';
  end if;

  begin
    -- The longest-running buff food in the catalogue, so (e)'s ceiling case is
    -- reachable and (b)/(c) have room to double without clamping.
    select b.item_id, b.type, b.magnitude, b.duration_ms
      into v_item, v_type, v_mag, v_dur
      from public.hr_item_buffs b where b.duration_ms <= 900000
      order by b.duration_ms desc, b.item_id limit 1;
    if v_item is null then raise exception 'cellar-scale self-check: FIXTURE — no buff food'; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
      values (v_uid, 0, 0, 0, 10, 10, 1, now())
      on conflict (user_id, slot) do update set version = 1, buffs = '[]'::jsonb;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, v_item, 500)
      on conflict (user_id, slot, item_id) do update set qty = 500;

    -- ── (b) NEGATIVE CONTROL — NO CELLAR, SCALE 1.0 ─────────────────────────
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'cellar-scale self-check (b): a plain consume was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if (v_q->0->>'scale')::numeric <> 1 then
      raise exception 'cellar-scale self-check (b): a character with NO Cellar was stamped at scale % — '
                      'the perk is being paid to everybody', v_q->0->>'scale';
    end if;
    v_base_ms := extract(epoch from ((v_q->0->>'until')::timestamptz - now())) * 1000;
    if abs(v_base_ms - v_dur) > 5000 then
      raise exception 'cellar-scale self-check (b): the unperked duration is % ms, catalogue says %',
                      v_base_ms, v_dur;
    end if;

    -- ── (d) EVERY RUNG PAYS ITS OWN NUMBER ──────────────────────────────────
    -- ASCENDING, and that is not a stylistic choice: hr_unlock_guard refuses a
    -- level unlock that DECREASES (unlock_regressed), because nothing in the game
    -- takes a room away. The ladder is therefore climbed the way a player climbs
    -- it, which is also the only order this probe can drive.
    for v_lvl in select level from public.hr_room_perks where room_id = 'cellar' order by level loop
      insert into public.player_progress (user_id, slot, kind, key, period_key, value)
        values (v_uid, 0, 'unlock', 'room:cellar', '', v_lvl)
        on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;
      update public.player_state set buffs = '[]'::jsonb where user_id = v_uid and slot = 0;
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
               jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                  'items', jsonb_build_object(v_item, -1), 'journal', c_j));
      if coalesce(v_r->>'ok', 'false') <> 'true' then
        raise exception 'cellar-scale self-check (d): rung % was refused: %', v_lvl, v_r; end if;
      select 1 + max((perks->>'buffDuration')::numeric) into v_want
        from public.hr_room_perks where room_id = 'cellar' and level <= v_lvl;
      select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
      if (v_q->0->>'scale')::numeric <> least(v_want, 2) then
        raise exception 'cellar-scale self-check (d): rung % stamped scale %, its own payload says % — '
                        'the ladder is being flattened to one number',
                        v_lvl, v_q->0->>'scale', least(v_want, 2);
      end if;
      v_ms := extract(epoch from ((v_q->0->>'until')::timestamptz - now())) * 1000;
      if abs(v_ms - v_base_ms * least(v_want, 2)) > 5000 then
        raise exception 'cellar-scale self-check (d): rung % bought % ms, expected % ms',
                        v_lvl, v_ms, v_base_ms * least(v_want, 2);
      end if;
    end loop;

    -- ── (c) THE RAISED CASE — THE TOP RUNG DOUBLES THE CONTROL ──────────────
    -- The character now stands on the top rung (the loop climbed to it). This is
    -- the arm stated against (b)'s MEASURED number rather than a literal, so a
    -- body that ignored the catalogue and hard-coded a doubling still fails (d).
    select max(level) into v_lvl from public.hr_room_perks where room_id = 'cellar';
    update public.player_state set buffs = '[]'::jsonb where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'cellar-scale self-check (c): the perked consume was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    select 1 + max((perks->>'buffDuration')::numeric) into v_want
      from public.hr_room_perks where room_id = 'cellar' and level <= v_lvl;
    if (v_q->0->>'scale')::numeric <> least(v_want, 2) then
      raise exception 'cellar-scale self-check (c): the top rung stamped scale %, catalogue says %',
                      v_q->0->>'scale', least(v_want, 2);
    end if;
    v_ms := extract(epoch from ((v_q->0->>'until')::timestamptz - now())) * 1000;
    if abs(v_ms - v_base_ms * least(v_want, 2)) > 5000 then
      raise exception 'cellar-scale self-check (c): the perked buff lasted % ms; the unperked control '
                      'lasted % ms and the rung sells x% — the scale is not reaching the clock',
                      v_ms, v_base_ms, least(v_want, 2);
    end if;

    -- ── (e) THE 60-MINUTE CEILING STILL BINDS ───────────────────────────────
    -- A queue already standing near the ceiling: the scaled consume may fill the
    -- remaining time but must not push the tail past it, and once there is
    -- nothing meaningful left to buy it is refused rather than eating the food.
    update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', v_mag + 10,
        'until', to_jsonb(now() + interval '59 minutes')))
      where user_id = v_uid and slot = 0;
    select qty into v_qty from public.player_inventory
     where user_id = v_uid and slot = 0 and item_id = v_item;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') = 'true' then
      if (select max((e.v->>'until')::timestamptz)
            from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
           where ps.user_id = v_uid and ps.slot = 0) > now() + interval '60 minutes 5 seconds' then
        raise exception 'cellar-scale self-check (e): the scale pushed a tail PAST the 60-minute cap';
      end if;
    elsif v_r->>'error' <> 'buff_at_max' then
      raise exception 'cellar-scale self-check (e): a capped consume failed with % instead of '
                      'buff_at_max', v_r;
    elsif (select qty from public.player_inventory
            where user_id = v_uid and slot = 0 and item_id = v_item) <> v_qty then
      raise exception 'cellar-scale self-check (e): the cap refusal still ate the food';
    end if;

    -- ── (f) A FORGED SCALE IS REFUSED, AND MOVES NOTHING ────────────────────
    update public.player_state set buffs = '[]'::jsonb where user_id = v_uid and slot = 0;
    select qty into v_qty from public.player_inventory
     where user_id = v_uid and slot = 0 and item_id = v_item;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item, 'scale', 1000),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'bad_buff_shape' then
      raise exception 'cellar-scale self-check (f): a client-sent `scale` was not refused '
                      'bad_buff_shape: %', v_r;
    end if;
    if (select buffs from public.player_state where user_id = v_uid and slot = 0) <> '[]'::jsonb
       or (select qty from public.player_inventory
            where user_id = v_uid and slot = 0 and item_id = v_item) <> v_qty then
      raise exception 'cellar-scale self-check (f): the forged apply moved state';
    end if;

    -- ── (g) THE JOURNAL — `bs` WHEN A PERK MOVED IT, AND NOT OTHERWISE ─────
    -- Measured as a HIGH-WATER MARK rather than by clearing the table: the
    -- ledger is append-only and its retention trigger refuses a delete inside the
    -- 90-day window, which is exactly the property that makes it a journal.
    select coalesce(max(id), 0) into v_led_hi
      from public.player_ledger where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'cellar-scale self-check (g): the consume was refused: %', v_r; end if;
    select count(*) into v_rows from public.player_ledger
     where user_id = v_uid and slot = 0 and id > v_led_hi;
    select meta into v_meta from public.player_ledger
     where user_id = v_uid and slot = 0 and id > v_led_hi order by id desc limit 1;
    if v_rows <> 1 then
      raise exception 'cellar-scale self-check (g): a buff wrote % ledger rows — one row per eaten pie '
                      'is the game_events mistake at ledger scale', v_rows;
    end if;
    if (v_meta->'delta'->>'bs')::numeric is null then
      raise exception 'cellar-scale self-check (g): the scale used is NOT journalled: %', v_meta; end if;
    if (v_meta->'delta'->>'bs')::numeric <> 2 then
      raise exception 'cellar-scale self-check (g): the journal says scale %, the top rung is 2',
                      v_meta->'delta'->>'bs';
    end if;
    -- …and the unperked control writes NO `bs` at all.
    delete from public.player_progress
     where user_id = v_uid and slot = 0 and key = 'room:cellar';
    select coalesce(max(id), 0) into v_led_hi
      from public.player_ledger where user_id = v_uid and slot = 0;
    update public.player_state set buffs = '[]'::jsonb where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'cellar-scale self-check (g): the unperked consume was refused: %', v_r; end if;
    select meta into v_meta from public.player_ledger
     where user_id = v_uid and slot = 0 and id > v_led_hi order by id desc limit 1;
    if v_meta->'delta' ? 'bs' then
      raise exception 'cellar-scale self-check (g): an unperked apply journalled a scale (%) — every '
                      'ledger row would carry a byte that says nothing', v_meta;
    end if;

    -- ── (h) THE ENVELOPE ───────────────────────────────────────────────────
    -- Both cases in one read: the segment just stamped (scale 1.0, no Cellar)
    -- and a seeded PRE-SCALE segment with no key at all, which must project 1.0
    -- rather than null — a renderer that has to guess draws "+undefined%".
    update public.player_state set buffs = buffs || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', v_mag + 1,
        'until', to_jsonb(now() + interval '30 minutes')))
      where user_id = v_uid and slot = 0;
    v_env := public.hr_state_of(v_uid, 0);
    if jsonb_array_length(v_env->'buffs') <> 2 then
      raise exception 'cellar-scale self-check (h): the envelope projects % buffs, expected 2',
                      jsonb_array_length(v_env->'buffs');
    end if;
    if (select count(*) from jsonb_array_elements(v_env->'buffs') as e(v)
         where (e.v->>'scale')::numeric is distinct from 1) > 0 then
      raise exception 'cellar-scale self-check (h): an envelope buff element is missing a usable '
                      'scale: %', v_env->'buffs';
    end if;
    if (select count(*) from jsonb_array_elements(v_env->'buffs') as e(v)
         where e.v ? 'remaining_ms' and e.v ? 'until' and e.v ? 'type' and e.v ? 'magnitude') <> 2 then
      raise exception 'cellar-scale self-check (h): the patch ATE a projected field: %', v_env->'buffs';
    end if;

    raise exception using errcode = 'HR831', message = 'cellar-scale §3 complete — rolling back';
  exception when sqlstate 'HR831' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'cellar-scale self-check: §3 LEAKED a probe row'; end if;

  raise notice 'cellar-scale self-check PASSED: a character with no Cellar is stamped at scale 1.0 and '
               'the catalogue duration; every rung pays its OWN payload (1.2/1.4/1.6/1.8/2.0) and the '
               'top rung doubles the SAME food the control measured; the 60-minute ceiling still binds '
               'and a capped consume is refused without eating the food; a client-sent `scale` is '
               'refused bad_buff_shape with nothing moved; the scale used is journalled on the ONE '
               'ledger row the apply already writes and is absent when no perk moved it; the envelope '
               'carries a usable scale on every element including a pre-scale segment; and no client '
               'role can execute the engine or write the perk catalogue';
end $mig$;
