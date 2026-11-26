-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1072-piece-verbs.sql — A TRAIT PIECE IS WORN, TAKEN OFF AND SOLD AS ITSELF: THE WEAR VERB, THE STORE SALE, AND THE
--   EQUIP PATH THAT NEVER TURNS A WORN PIECE INTO A PLAIN ITEM (lane/t1b-piece-verbs, backend-architect, 2026-11-26; 12-targets.md 8.6,
--   20-v030-the-roads.md 1.2 "Trait pieces are kept, carried over or sold to the store", 13-market.md 3.2 V for a piece, 13-security-list.md
--   S-23, N-12, N-13; the price is 1072-piece-verbs-catalogue.generated.sql).
-- RESTATEMENT-DEBT-ACK: hr_apply's chain is one deep (1059-company-trades.sql); this file adds ONE anchored edit, the equip loop's body, because a 162 KB restatement would collide with every lane that reads hr_apply while the piece class must close here.
--
-- STATUS: supabase/migration-notes/1072-piece-verbs.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12), after 1072-piece-verbs-catalogue.generated.sql (the price it reads).
--   Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── DARK ─────────────────────────────────────────────────────────────────────
-- Behind 1071's `trait_pieces` switch (OFF at apply): both verbs answer pieces_dark, an equip op that names a piece is refused pieces_dark,
--   and the `pieces` section stays null. THE EQUIP PATH'S PIECE RULE IS NOT BEHIND IT: an unequip or a swap of a slot a piece is worn in
--   frees the piece and credits nothing to the bag whatever the switch says, so no switch order can open the duplication.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_apply's EQUIP block (ONE anchored edit; the rest of the body is 1059's image):
--   · a piece worn in equip slot k (trait_pieces.worn_slot / worn_equip_slot) is the slot's unit. An unequip (null) or a swap (an item
--     name) frees the piece (worn_* null) and does NOT credit its base to player_inventory (b362's class: a plain copy beside the piece,
--     or a piece stripped of its Traits by taking it off). A plain item in the slot is credited back as before.
--   · an item name equal to the worn base is a no-op: a setup that names its base keeps the piece on (hr_hunt_preset_apply, company wear).
--   · an op {"piece": "<uuid>"} wears one of the account's pieces in k: the row (for update) is the account's (unknown_piece), free of
--     escrow (piece_escrowed) and worn by no other hero or slot (piece_worn); its base fits k (wrong_slot) and the hero meets its
--     requirement (requirement_not_met). Nothing is debited from the bag: the row is the unit. The slot's old unit is credited as above.
-- hr_piece_wear(p_slot int, p_piece uuid, p_equip_slot text, p_idem uuid) -> jsonb   NEW, authenticated, MONEY-ADJACENT (hero power):
--   one of the account's pieces onto hero p_slot, in town and idle (hunt_open, activity_running: setups change in town), into
--   p_equip_slot or, when null, the base's only equip slot (equip_slot_needed for a ring). Through hr_apply's equip op above, journalled
--   kind 'equip', intent piece_wear:<piece>. Answers the envelope (rule 11). Refusals: not_signed_in, pieces_dark, bad_slot, bad_idem,
--   bad_piece, bad_equip_slot, rate_limited, no_character, hunt_open, activity_running, unknown_piece, equip_slot_needed, and every
--   refusal hr_apply's equip op answers (piece_worn, piece_escrowed, wrong_slot, requirement_not_met, two_handed, version_conflict ...).
-- hr_piece_sell(p_slot int, p_piece uuid, p_gold bigint, p_idem uuid) -> jsonb   NEW, authenticated, MONEY (mints gold):
--   the store buys one free piece of the account at the server's price (hr_piece_store_bid: floor share x V, 13-market 3.2), journalled
--   through hero p_slot. p_gold is the price the player was shown (the section's `sell`): another refuses quote_changed and moves
--   nothing. At most hr_piece_value_rules.sell_day sales an account a UTC day, counted from the append-only ledger under the account's
--   sale lock (sell_day_cap). The row is DELETED and the gold credited in one hr_apply { gold } journalled kind 'shop', intent
--   piece_sell:<piece>, meta the piece as it was (base, slot, rarity, Traits, item Level, where found): a sold piece is gone for good and
--   the ledger is its only record. Answers the envelope. Refusals: not_signed_in, pieces_dark, bad_slot, bad_idem, bad_piece, bad_quote,
--   rate_limited, no_character, unknown_piece, piece_worn (take it off first), piece_escrowed, not_sellable (a rarity the store does
--   not price), quote_changed { gold }, sell_day_cap { sold, max }, and hr_apply's own (version_conflict, the day budget ...).
--   SALVAGE IS NOT BUILT: 20-v030 section 1.3 ships salvage separately and v0.3.0 has no scrap (src/data/trades.js), so a piece's
--   v0.3.0 exits are wear, the store and carry-over (21 section 2.3, its own lane).
-- THE SECTION `pieces` (hr_trait_pieces_view, RESTATED WHOLE from 1071's image): each piece also carries `sell` (the store's price now,
--   null where it buys none), and the section `sell_left` (sales the account has left today). Every number the screen acts on.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Lock order, both verbs: the hero (hr_hunt_lock: its advisory key, which hr_apply's own lock re-enters, and its player_state row), then
--   (sell) the account's sale key, then the piece rows, the target first and then the one worn in the slot, then the bag rows and the purse
--   inside hr_apply. A piece worn by another hero is refused after its own row lock and before any other, so two heroes swapping each
--   other's pieces cannot wait on each other. One piece a row, so two heroes wearing it, or a sale racing a wear, serialise on that row:
--   the loser reads it worn (piece_worn) or gone (unknown_piece). The unique index trait_pieces_worn_once is the second fence.
-- Each press carries a client key: replayed before and again under the lock (hr_intent_replay), then claimed by hr_apply on the verb
--   name piece_wear:<piece> / piece_sell:<piece>, so a key replayed for another piece is intent_mismatch, and a replayed success answers
--   the envelope and moves nothing. A refused sale rolls its delete back with the refusal (its own subtransaction).
-- A second apply restates the same bodies and the same baseline rows: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- Two authenticated verbs naming a slot, a piece id, an equip slot or a gold figure and a key. They reach only the caller's own heroes
--   and pieces (auth.uid(); hr_apply's identity seam). The gold figure only refuses, it never sets the price. The sale MINTS gold, bounded
--   by the server's price, one piece a call, the day fuse, hr_apply's per-call clamp and its daily inflow budget; the piece it pays for is
--   deleted in the same transaction, so a piece sells once. The equip path's edit removes a mint (the bag credit of a worn piece's base).
--   ON THE PRE-EA SECURITY LIST (13-security-list.md S-23).
--
-- ── COST (100x: 2,000 accounts x 4 heroes) ───────────────────────────────────
-- Off the settle path. An equip op reads one more row (the unique worn index). A wear or a sale: the hero lock, two to four indexed rows and
--   one hr_apply (its one ledger row). Lit, the section prices each piece (three primary-key reads a piece) and counts the day's sales once
--   (the ledger's gold index): ~170 B a piece in every envelope, the stock bounded by the store and carry-over. Dark, nothing.
--
-- EDGE: none (the edge's equip verb already reaches hr_apply; its {slot: null} unequip of a worn piece now frees the piece).
-- REVERSIBLE: restate hr_apply from 1059's image (md5 4c9289bb76e2f7eec7d862bb8a7ac9e1) and hr_trait_pieces_view from 1071's; drop the two
--   verbs and their baseline rows. A piece worn or sold while lit stays as the ledger says.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.trait_pieces') is null or to_regprocedure('public.hr_trait_pieces_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: 1071-trait-pieces.sql first (trait_pieces, the pieces section)'; end if;
  if to_regprocedure('public.hr_piece_store_bid(text,integer,integer)') is null or to_regclass('public.hr_piece_value_rules') is null then
    raise exception 'PRECONDITION: the price first (1072-piece-verbs-catalogue.generated.sql)'; end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null or to_regprocedure('public.hr_flag_on(text)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_item_slots') is null or to_regclass('public.player_ledger') is null then
    raise exception 'PRECONDITION: a helper or table this file calls is missing'; end if;
  -- THE PINS: each body this file moves is the image it was derived from, or this file's own (a second apply)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  if v_md5 is distinct from '4c9289bb76e2f7eec7d862bb8a7ac9e1'
     and position('PIECE-VERBS (1072-piece-verbs.sql)' in (select prosrc from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure)) = 0 then
    raise exception 'PIN: hr_apply is neither 1059''s image nor this file''s own (md5 %): another file moved it; re-derive this edit', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_trait_pieces_view(uuid,integer)'::regprocedure;
  if v_md5 is distinct from '7d001d0f34ed275beed0bb19fdcfe48b'
     and position('PIECE-VERBS (1072-piece-verbs.sql)' in (select prosrc from pg_proc where oid = 'public.hr_trait_pieces_view(uuid,integer)'::regprocedure)) = 0 then
    raise exception 'PIN: hr_trait_pieces_view is neither 1071''s image nor this file''s own (md5 %): re-derive this restatement', v_md5; end if;
end $mig$;

-- ── §1 hr_apply: ONE ANCHORED EDIT, THE EQUIP LOOP'S BODY (PIECE-VERBS; RESTATEMENT-DEBT-ACK in the header) ──
do $mig$
declare
  v_def text; v_old text; v_new text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'PIECE-VERBS (1072-piece-verbs.sql)') > 0 then raise notice 'hr_apply already carries PIECE-VERBS: edit skipped'; return; end if;
  v_old := $a$        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;

        if jsonb_typeof(v_eq) = 'null' then
          -- UNEQUIP: return the unit to the bank.
          if v_cur is not null then
            delete from public.player_equipment
             where user_id = v_uid and slot = v_slot and equip_slot = k;
            insert into public.player_inventory as pi (user_id, slot, item_id, qty)
              values (v_uid, v_slot, v_cur, 1)
              on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
          end if;
          continue;
        end if;

        if jsonb_typeof(v_eq) <> 'string' then
          perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));
        end if;
        v_item := v_eq #>> '{}';
        if v_cur is not null and v_cur = v_item then continue; end if;   -- no-op

        if not exists (select 1 from public.hr_items where item_id = v_item) then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
        end if;
        if not exists (select 1 from public.hr_item_slots
                        where item_id = v_item and equip_slot = k) then
          perform public.hr_reject('wrong_slot',
            jsonb_build_object('item_id', v_item, 'equip_slot', k));
        end if;
        -- The requirement is re-checked here even though the Edge Function
        -- already checked it. "The caller checked" is not a control.
        -- GEAR-BY-LEVEL (2027-01-14-gear-by-level.sql, Tyler 2026-10-24): the catalogue row's requirement,
        -- read by hr_item_requirement_unmet: the hero's Level for every piece of gear, a skill for ammo.
        -- The refusal says what it read (req, need, have): the screen states the server's own numbers.
        if public.hr_item_requirement_unmet(v_uid, v_slot, v_item) is not null then
          perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item)
                                   || public.hr_item_requirement_unmet(v_uid, v_slot, v_item));
        end if;

        -- DEBIT one from the bank. This is the ownership check; there is
        -- nothing else to check.
        select qty into v_have from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_item for update;
        if coalesce(v_have, 0) < 1 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));
        end if;
        if v_have = 1 then
          delete from public.player_inventory
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        else
          update public.player_inventory set qty = qty - 1
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        end if;

        -- CREDIT back whatever was in the slot.
        if v_cur is not null then
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (v_uid, v_slot, v_cur, 1)
            on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
        end if;

        insert into public.player_equipment as pe (user_id, slot, equip_slot, item_id)
          values (v_uid, v_slot, k, v_item)
          on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
      end loop;$a$;
  v_new := $a$        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;

        -- PIECE-VERBS (1072-piece-verbs.sql): A TRAIT PIECE IS ITS OWN UNIT. A piece worn in this slot (a trait_pieces row, never a bag
        -- stack) goes back to the account's free pieces when the slot changes, and its base NEVER reaches the bag: no unequip or swap can
        -- leave a plain copy beside the piece (b362's class) or strip its Traits. An op {"piece": <id>} wears one of the account's pieces;
        -- the row is the unit, so nothing is debited from the bag. A plain item in the slot moves exactly as before.
        declare
          v_was public.trait_pieces%rowtype;   -- the piece this hero wears in slot k now, if any
          v_put public.trait_pieces%rowtype;   -- the piece this op puts on, if it names one
        begin
          if jsonb_typeof(v_eq) = 'object' then
            if (select count(*) from jsonb_object_keys(v_eq)) <> 1 or jsonb_typeof(v_eq->'piece') is distinct from 'string'
               or (v_eq->>'piece') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
              perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));
            end if;
            if not public.hr_flag_on('trait_pieces') then perform public.hr_reject('pieces_dark'); end if;
            -- THE PIECE FIRST: its row lock before the worn one's, so a piece worn elsewhere is refused holding no other piece
            select * into v_put from public.trait_pieces
             where id = (v_eq->>'piece')::uuid and user_id = v_uid for update;
            if v_put.id is null then perform public.hr_reject('unknown_piece', jsonb_build_object('piece', v_eq->'piece')); end if;
            if v_put.escrow is not null then
              perform public.hr_reject('piece_escrowed', jsonb_build_object('piece', v_put.id, 'escrow', v_put.escrow));
            end if;
            if v_put.worn_slot is not null and (v_put.worn_slot <> v_slot or v_put.worn_equip_slot <> k) then
              perform public.hr_reject('piece_worn', jsonb_build_object('piece', v_put.id,
                'worn', jsonb_build_object('slot', v_put.worn_slot, 'equip_slot', v_put.worn_equip_slot)));
            end if;
          elsif jsonb_typeof(v_eq) not in ('null', 'string') then
            perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));
          end if;
          select * into v_was from public.trait_pieces
           where user_id = v_uid and worn_slot = v_slot and worn_equip_slot = k for update;

          if jsonb_typeof(v_eq) = 'null' then
            -- UNEQUIP: return the unit to the bank; a worn piece to the account's free pieces, its base never to the bag.
            if v_was.id is not null then
              update public.trait_pieces set worn_slot = null, worn_equip_slot = null, worn_at = null where id = v_was.id;
            end if;
            if v_cur is not null then
              delete from public.player_equipment
               where user_id = v_uid and slot = v_slot and equip_slot = k;
              if v_was.id is null or v_was.base is distinct from v_cur then
                insert into public.player_inventory as pi (user_id, slot, item_id, qty)
                  values (v_uid, v_slot, v_cur, 1)
                  on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
              end if;
            end if;
            continue;
          end if;

          if v_put.id is not null then
            v_item := v_put.base;
            if v_was.id = v_put.id and v_cur is not distinct from v_item then continue; end if;   -- worn here already: no-op
          else
            v_item := v_eq #>> '{}';
            -- no-op; a worn piece whose base is named stays on (a setup that names its base keeps the piece)
            if v_cur is not null and v_cur = v_item then continue; end if;
          end if;

          if not exists (select 1 from public.hr_items where item_id = v_item) then
            perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
          end if;
          if not exists (select 1 from public.hr_item_slots
                          where item_id = v_item and equip_slot = k) then
            perform public.hr_reject('wrong_slot',
              jsonb_build_object('item_id', v_item, 'equip_slot', k));
          end if;
          -- The requirement is re-checked here even though the Edge Function
          -- already checked it. "The caller checked" is not a control.
          -- GEAR-BY-LEVEL (2027-01-14-gear-by-level.sql, Tyler 2026-10-24): the catalogue row's requirement,
          -- read by hr_item_requirement_unmet: the hero's Level for every piece of gear, a skill for ammo.
          -- The refusal says what it read (req, need, have): the screen states the server's own numbers.
          if public.hr_item_requirement_unmet(v_uid, v_slot, v_item) is not null then
            perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item)
                                     || public.hr_item_requirement_unmet(v_uid, v_slot, v_item));
          end if;

          if v_put.id is null then
            -- DEBIT one from the bank. This is the ownership check; there is
            -- nothing else to check. (A piece is its own row: nothing to debit.)
            select qty into v_have from public.player_inventory
             where user_id = v_uid and slot = v_slot and item_id = v_item for update;
            if coalesce(v_have, 0) < 1 then
              perform public.hr_reject('insufficient_item',
                jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));
            end if;
            if v_have = 1 then
              delete from public.player_inventory
               where user_id = v_uid and slot = v_slot and item_id = v_item;
            else
              update public.player_inventory set qty = qty - 1
               where user_id = v_uid and slot = v_slot and item_id = v_item;
            end if;
          end if;

          -- CREDIT back whatever was in the slot: a worn piece to the account's free pieces, a plain item to the bank.
          if v_was.id is not null then
            update public.trait_pieces set worn_slot = null, worn_equip_slot = null, worn_at = null where id = v_was.id;
          end if;
          if v_cur is not null and (v_was.id is null or v_was.base is distinct from v_cur) then
            insert into public.player_inventory as pi (user_id, slot, item_id, qty)
              values (v_uid, v_slot, v_cur, 1)
              on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
          end if;

          insert into public.player_equipment as pe (user_id, slot, equip_slot, item_id)
            values (v_uid, v_slot, k, v_item)
            on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
          if v_put.id is not null then
            update public.trait_pieces set worn_slot = v_slot, worn_equip_slot = k, worn_at = now() where id = v_put.id;
          end if;
        end;
      end loop;$a$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'PIECE-VERBS: hr_apply''s equip loop anchor matched % times (want 1): re-derive this edit', v_n; end if;
  execute replace(v_def, v_old, v_new);
end $mig$;

-- ── §2 THE SECTION `pieces`, RESTATED WHOLE (1071's image + each piece's store price and the day's sales left) ──
create or replace function public.hr_trait_pieces_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_left int;
begin
  -- THE SECTION `pieces` (1071-trait-pieces.sql): the account's Trait and Signature pieces as the server holds them, newest first. Each
  -- names its session (the return card's line: what that hunt found), where it was found and who wears it. null while trait_pieces is off.
  -- PIECE-VERBS (1072-piece-verbs.sql): RESTATED WHOLE. Each piece also carries `sell`, what the store pays for it now (hr_piece_store_bid,
  -- null where it buys none: the Sell press sends exactly this back), and the section `sell_left`, the sales the account has left today.
  if not public.hr_flag_on('trait_pieces') then return null; end if;
  if exists (select 1 from public.trait_pieces p where p.user_id = p_user) then
    v_left := greatest(0, coalesce((select r.sell_day from public.hr_piece_value_rules r where r.id), 0)
      - (select count(*) from public.player_ledger l
          where l.user_id = p_user and l.gold <> 0 and l.at >= public.hr_utc_day_start(now()) and l.kind = 'shop' and l.intent like 'piece_sell:%')::int);
  end if;
  return jsonb_build_object('pieces', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'base', p.base, 'slot', p.slot, 'rarity', p.rarity, 'traits', p.traits, 'signature', p.signature, 'il', p.item_level,
      'ground', p.hunt_id, 'depth', p.depth, 'found_by', p.found_slot, 'session', p.session_id, 'at_ms', p.at_ms,
      'worn', case when p.worn_slot is null then null else jsonb_build_object('slot', p.worn_slot, 'equip_slot', p.worn_equip_slot) end,
      'escrow', p.escrow,
      'sell', public.hr_piece_store_bid(p.rarity, p.item_level,
                (select coalesce(max((t.value->>'rank')::int), 1) from jsonb_array_elements(p.traits) t))) order by p.at_ms desc, p.id)
    from public.trait_pieces p where p.user_id = p_user), '[]'::jsonb),
    'sell_left', coalesce(v_left, 0));
end $fn$;
revoke execute on function public.hr_trait_pieces_view(uuid, integer) from public, anon, authenticated, service_role;

-- ── §3 THE WEAR VERB ─────────────────────────────────────────────────────────
create or replace function public.hr_piece_wear(p_slot int, p_piece uuid, p_equip_slot text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_s public.hunt_sessions%rowtype; v_st public.player_state%rowtype;
  v_p public.trait_pieces%rowtype; v_k text; v_n int; v_a jsonb;
begin
  -- PIECE-VERBS (1072-piece-verbs.sql): one of the account's Trait pieces onto hero p_slot, in town and idle, through hr_apply's equip
  -- op { <equip slot>: { piece } }, which locks the piece and re-proves every property (owner, escrow, worn elsewhere, slot, Level).
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('trait_pieces') then return jsonb_build_object('ok', false, 'error', 'pieces_dark'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_piece is null then return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'bad_piece')); end if;
  if p_equip_slot is not null and p_equip_slot !~ '^[a-z0-9_]{1,32}$' then
    return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'bad_equip_slot')); end if;
  v_verb := 'piece_wear:' || p_piece;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then
    if coalesce(v_r->>'ok', 'false') = 'true' then return public.hr_state_of(v_uid, p_slot) || jsonb_build_object('replayed', true); end if;
    return public.hr_note_rejection('piece_wear', p_slot, v_r || jsonb_build_object('replayed', true));
  end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then
    if coalesce(v_r->>'ok', 'false') = 'true' then return public.hr_state_of(v_uid, p_slot) || jsonb_build_object('replayed', true); end if;
    return public.hr_note_rejection('piece_wear', p_slot, v_r || jsonb_build_object('replayed', true));
  end if;
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- IN TOWN AND IDLE: the worn set is a setup's gear, and setups change in town (equip.js, hr_hunt_preset_apply)
  if v_s.id is not null then
    return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id)); end if;
  if v_st.active_kind <> 'idle' then
    return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind)); end if;
  select * into v_p from public.trait_pieces where id = p_piece and user_id = v_uid;
  if v_p.id is null then return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_piece')); end if;
  -- THE EQUIP SLOT: the one named, or the base's only one (a ring fits two: the press names which)
  if p_equip_slot is null then
    select count(*)::int, min(s.equip_slot) into v_n, v_k from public.hr_item_slots s where s.item_id = v_p.base;
    if v_n <> 1 then
      return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'equip_slot_needed',
        'slots', (select coalesce(jsonb_agg(s.equip_slot order by s.equip_slot), '[]'::jsonb) from public.hr_item_slots s where s.item_id = v_p.base)));
    end if;
  else
    v_k := p_equip_slot;
  end if;
  v_a := public.hr_apply(v_uid, p_slot, v_st.version, p_idem, jsonb_build_object(
           'equip', jsonb_build_object(v_k, jsonb_build_object('piece', v_p.id)),
           'journal', jsonb_build_object('kind', 'equip', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'piece_wear', 'piece', v_p.id, 'base', v_p.base, 'rarity', v_p.rarity,
                                                                    'equip_slot', v_k))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then return public.hr_note_rejection('piece_wear', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  return v_a;   -- hr_apply's envelope (rule 11): the piece worn, the old unit back where it belongs
end $fn$;

-- ── §4 THE STORE SALE ────────────────────────────────────────────────────────
create or replace function public.hr_piece_sell(p_slot int, p_piece uuid, p_gold bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_st public.player_state%rowtype; v_p public.trait_pieces%rowtype;
  v_bid bigint; v_max int; v_n int; v_a jsonb;
begin
  -- PIECE-VERBS (1072-piece-verbs.sql): the store buys one free piece of the account at the server's price; the row is deleted and
  -- the gold credited in one transaction (hr_apply { gold }), journalled through hero p_slot with the piece as it was.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('trait_pieces') then return jsonb_build_object('ok', false, 'error', 'pieces_dark'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_piece is null then return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'bad_piece')); end if;
  if p_gold is null or p_gold < 0 or p_gold > 1000000000000 then
    return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'piece_sell:' || p_piece;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then
    if coalesce(v_r->>'ok', 'false') = 'true' then return public.hr_state_of(v_uid, p_slot) || jsonb_build_object('replayed', true); end if;
    return public.hr_note_rejection('piece_sell', p_slot, v_r || jsonb_build_object('replayed', true));
  end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then
    if coalesce(v_r->>'ok', 'false') = 'true' then return public.hr_state_of(v_uid, p_slot) || jsonb_build_object('replayed', true); end if;
    return public.hr_note_rejection('piece_sell', p_slot, v_r || jsonb_build_object('replayed', true));
  end if;
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE ACCOUNT'S SALE KEY: the day's count below is exact across the account's heroes (taken after the hero, before the piece)
  perform pg_advisory_xact_lock(hashtextextended('piece_sell:' || v_uid::text, 0));
  select * into v_p from public.trait_pieces where id = p_piece and user_id = v_uid for update;
  if v_p.id is null then return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_piece')); end if;
  if v_p.worn_slot is not null then
    return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'piece_worn',
      'worn', jsonb_build_object('slot', v_p.worn_slot, 'equip_slot', v_p.worn_equip_slot))); end if;
  if v_p.escrow is not null then
    return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'piece_escrowed')); end if;
  v_bid := public.hr_piece_store_bid(v_p.rarity, v_p.item_level,
             (select coalesce(max((t.value->>'rank')::int), 1) from jsonb_array_elements(v_p.traits) t));
  if v_bid is null then return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'not_sellable')); end if;
  if v_bid <> p_gold then
    return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'gold', v_bid)); end if;
  -- THE DAY FUSE: the account's piece sales since the UTC day began, from the append-only ledger (its gold index)
  select r.sell_day into v_max from public.hr_piece_value_rules r where r.id;
  select count(*)::int into v_n from public.player_ledger l
   where l.user_id = v_uid and l.gold <> 0 and l.at >= public.hr_utc_day_start(now()) and l.kind = 'shop' and l.intent like 'piece_sell:%';
  if v_max is null or v_n >= v_max then
    return public.hr_note_rejection('piece_sell', p_slot, jsonb_build_object('ok', false, 'error', 'sell_day_cap', 'sold', v_n, 'max', v_max)); end if;
  -- THE SALE: the row first (so the envelope hr_apply answers no longer holds it), then the gold; a refused credit undoes the delete
  begin
    delete from public.trait_pieces where id = v_p.id;
    v_a := public.hr_apply(v_uid, p_slot, v_st.version, p_idem, jsonb_build_object(
             'gold', v_bid,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'piece_sell', 'piece', v_p.id, 'base', v_p.base, 'slot', v_p.slot,
                                                                      'rarity', v_p.rarity, 'traits', v_p.traits, 'signature', v_p.signature,
                                                                      'il', v_p.item_level, 'ground', v_p.hunt_id, 'depth', v_p.depth,
                                                                      'found_by', v_p.found_slot, 'at_ms', v_p.at_ms, 'unit_gold', v_bid))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRP72', message = 'piece_sell: hr_apply refused'; end if;
  exception when sqlstate 'HRP72' then
    return public.hr_note_rejection('piece_sell', p_slot, v_a || jsonb_build_object('ok', false));
  end;
  return v_a;   -- hr_apply's envelope (rule 11): the piece gone, the purse paid
end $fn$;

-- ── §5 THE GRANTS AND THE CLIENT SURFACE ─────────────────────────────────────
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_piece_wear(integer,uuid,text,uuid)', 'public.hr_piece_sell(integer,uuid,bigint,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_piece_wear', 'its own pieces'), ('hr_piece_sell', 'its own pieces')
      on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_piece_wear', 'hr_piece_sell');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_piece_wear', 'p_slot integer, p_piece uuid, p_equip_slot text, p_idem uuid', 'authenticated',
   'added 1072-piece-verbs.sql (lane/t1b-piece-verbs): hero power - one of the account''s Trait pieces onto a hero in town, through hr_apply''s equip op (the row is the unit, never a bag stack); dark (trait_pieces)'),
  ('hr_piece_sell', 'p_slot integer, p_piece uuid, p_gold bigint, p_idem uuid', 'authenticated',
   'added 1072-piece-verbs.sql (lane/t1b-piece-verbs): MONEY (mints gold) - the store buys a free piece at the server''s price, refuses quote_changed, a day fuse an account, the row deleted; dark (trait_pieces)');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) DARK: both verbs answer pieces_dark and an equip op naming a piece is refused pieces_dark; a plain unequip of a slot a piece is worn
--     in still frees the piece and credits nothing (the class holds whatever the switch says); the section is null.
-- (b) THE WEAR, lit: a piece goes on (the slot's plain item to the bag, no base debited), a replayed key moves nothing, another hero is
--     refused piece_worn, an escrowed or another account's piece is refused; an unequip, a swap to a plain item and a setup op that names
--     another item each free the piece and never put its base in the bag; an op naming the base keeps it on.
-- (c) THE SALE, lit: a worn piece is refused, a wrong price is quote_changed and moves nothing, the right price deletes the row, pays the
--     purse exactly the twin's price, journals one shop row with the piece; the replay pays nothing; the day fuse refuses past its count;
--     the section carries each piece's price and the sales left.
-- (d) THE BODIES AND THE GRANTS: hr_apply carries the edit; both verbs are the client's and no other role's; the price is no client's;
--     grant hygiene is quiet; no probe row leaked; every switch off.
do $$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-0000071a1172';
  v_o   constant uuid := '000000c0-0000-4000-a000-0000071a1173';
  v_ins constant uuid := '000000c0-0000-4000-a000-0000071a1174';
  v jsonb; v_code text; v_b text; v_w0 text; v_alt text; v_p uuid; v_q uuid; v_x uuid; v_bid bigint; v_g0 bigint; v_ver bigint;
  v_hunt text := 'muster_barrows';
  bag constant text := 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)';
  v_n bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u), (v_o) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'piece-verbs §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): a second hero refused: %', v; end if;
    -- the starter weapon, a weapon base the fresh hero meets (not the starter), and another (the swap's plain item)
    select item_id into v_w0 from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    select min(s.item_id) into v_b from public.hr_item_slots s join public.hr_items i on i.item_id = s.item_id
     where s.equip_slot = 'weapon' and not i.two_handed and public.hr_item_requirement_unmet(v_u, 0, s.item_id) is null
       and s.item_id is distinct from v_w0 and (select count(*) from public.hr_item_slots s2 where s2.item_id = s.item_id) = 1;
    select min(s.item_id) into v_alt from public.hr_item_slots s join public.hr_items i on i.item_id = s.item_id
     where s.equip_slot = 'weapon' and not i.two_handed and public.hr_item_requirement_unmet(v_u, 0, s.item_id) is null
       and s.item_id <> v_b and s.item_id is distinct from v_w0;
    if v_b is null or v_alt is null then raise exception 'VERIFY(b): no two weapons a fresh hero can wear'; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_alt, 1)
      on conflict (user_id, slot, item_id) do update set qty = public.player_inventory.qty + 1;
    insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms)
      values (v_u, 0, v_b, 'weapon', 60, 'rare', '[{"id": "file_breaker", "rank": 1}]', v_hunt, 0, 1, v_ins, 1, 1) returning id into v_p;
    insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms, escrow)
      values (v_u, 0, v_b, 'weapon', 60, 'rare', '[{"id": "file_breaker", "rank": 1}]', v_hunt, 0, 1, v_ins, 2, 2, 'market') returning id into v_q;
    insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms)
      values (v_o, 0, v_b, 'weapon', 60, 'rare', '[{"id": "file_breaker", "rank": 1}]', v_hunt, 0, 1, v_ins, 3, 3) returning id into v_x;

    -- (a) dark
    update public.hr_flags set enabled = false where key = 'trait_pieces';
    if public.hr_piece_wear(0, v_p, null, gen_random_uuid())->>'error' is distinct from 'pieces_dark'
       or public.hr_piece_sell(0, v_p, 1, gen_random_uuid())->>'error' is distinct from 'pieces_dark' then
      raise exception 'VERIFY(a): a dark verb answered something else'; end if;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('equip', jsonb_build_object('weapon', jsonb_build_object('piece', v_p)),
           'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:weapon')));
    if v->>'error' is distinct from 'pieces_dark' then raise exception 'VERIFY(a): a dark piece op answered %', v; end if;
    -- the class holds dark: a piece worn (planted) in the slot, unequipped by the plain path, credits nothing (the starter to the bag first)
    if v_w0 is not null then
      insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_w0, 1)
        on conflict (user_id, slot, item_id) do update set qty = public.player_inventory.qty + 1;
    end if;
    update public.trait_pieces set worn_slot = 0, worn_equip_slot = 'weapon', worn_at = now() where id = v_p;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'weapon', v_b)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    execute bag into v_n using v_u, v_b;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('equip', jsonb_build_object('weapon', null),
           'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:weapon')));
    if coalesce(v->>'ok', '') <> 'true' or (select worn_slot from public.trait_pieces where id = v_p) is not null then
      raise exception 'VERIFY(a): a dark unequip of a worn piece answered % (piece worn %)', v->>'error', (select worn_slot from public.trait_pieces where id = v_p); end if;
    if (select count(*) from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_b and qty > v_n) > 0 then
      raise exception 'VERIFY(a): taking a worn piece off put its base in the bag (DUPLICATION)'; end if;
    if public.hr_trait_pieces_view(v_u, 0) is not null then raise exception 'VERIFY(a): the dark section answered'; end if;
    if v_w0 is not null then
      select version into v_ver from public.player_state where user_id = v_u and slot = 0;
      v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('equip', jsonb_build_object('weapon', v_w0),
             'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:weapon')));
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the starter weapon would not go back on: %', v; end if;
    end if;

    -- (b) the wear, lit
    update public.hr_flags set enabled = true where key = 'trait_pieces';
    execute bag into v_n using v_u, v_b;
    v := public.hr_piece_wear(0, v_p, null, '000000c0-0000-4000-a000-0000071a1175');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the wear refused %', v; end if;
    if (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'weapon') is distinct from v_b
       or (select worn_slot::text || worn_equip_slot from public.trait_pieces where id = v_p) is distinct from '0weapon' then
      raise exception 'VERIFY(b): the piece is not worn where it was put'; end if;
    if v_w0 is not null and v_w0 <> v_b and (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_w0) is null then
      raise exception 'VERIFY(b): the slot''s plain weapon did not go back to the bag'; end if;
    if (select coalesce((select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_b), 0)) <> v_n then
      raise exception 'VERIFY(b): the wear moved the base''s bag stack'; end if;
    if jsonb_typeof(v->'pieces'->'pieces') <> 'array' then raise exception 'VERIFY(b): the wear did not answer the envelope'; end if;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_piece_wear(0, v_p, null, '000000c0-0000-4000-a000-0000071a1175');
    if coalesce(v->>'replayed', '') <> 'true' or (select version from public.player_state where user_id = v_u and slot = 0) <> v_ver then
      raise exception 'VERIFY(b): a replayed wear moved something: %', v; end if;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    if public.hr_piece_wear(1, v_p, null, gen_random_uuid())->>'error' is distinct from 'piece_worn' then
      raise exception 'VERIFY(b): another hero put on a worn piece'; end if;
    if public.hr_piece_wear(1, v_q, null, gen_random_uuid())->>'error' is distinct from 'piece_escrowed'
       or public.hr_piece_wear(1, v_x, null, gen_random_uuid())->>'error' is distinct from 'unknown_piece' then
      raise exception 'VERIFY(b): an escrowed or another account''s piece went on'; end if;
    -- off by the plain path: the piece is free and its base is NOT in the bag
    execute bag into v_n using v_u, v_b;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('equip', jsonb_build_object('weapon', null),
           'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:weapon')));
    if coalesce(v->>'ok', '') <> 'true' or (select worn_slot from public.trait_pieces where id = v_p) is not null then
      raise exception 'VERIFY(b): the unequip left the piece worn: %', v; end if;
    execute bag into v_code using v_u, v_b;
    if v_code::bigint <> v_n then raise exception 'VERIFY(b): the unequip put the piece''s base in the bag (% -> %): DUPLICATION', v_n, v_code; end if;
    -- a swap to a plain item frees it too
    perform public.hr_piece_wear(0, v_p, 'weapon', gen_random_uuid());
    execute bag into v_n using v_u, v_b;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('equip', jsonb_build_object('weapon', v_alt),
           'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:weapon')));
    execute bag into v_code using v_u, v_b;
    if coalesce(v->>'ok', '') <> 'true' or (select worn_slot from public.trait_pieces where id = v_p) is not null or v_code::bigint <> v_n
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'weapon') is distinct from v_alt then
      raise exception 'VERIFY(b): a swap off the piece answered % (base in bag % -> %)', v->>'error', v_n, v_code; end if;
    -- an op that names the base keeps the piece on
    perform public.hr_piece_wear(0, v_p, 'weapon', gen_random_uuid());
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('equip', jsonb_build_object('weapon', v_b),
           'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:weapon')));
    if coalesce(v->>'ok', '') <> 'true' or (select worn_slot from public.trait_pieces where id = v_p) is distinct from 0 then
      raise exception 'VERIFY(b): naming the worn base took the piece off: %', v; end if;

    -- (c) the sale
    v_bid := public.hr_piece_store_bid('rare', 60, 1);
    if v_bid is null or v_bid <= 0 then raise exception 'VERIFY(c): the store prices a Rare at %', v_bid; end if;
    if public.hr_piece_sell(0, v_p, v_bid, gen_random_uuid())->>'error' is distinct from 'piece_worn' then
      raise exception 'VERIFY(c): a worn piece was sold'; end if;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    perform public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('equip', jsonb_build_object('weapon', null),
              'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:weapon')));
    if (select (p->>'sell')::bigint from jsonb_array_elements(public.hr_trait_pieces_view(v_u, 0)->'pieces') p where p->>'id' = v_p::text) is distinct from v_bid
       or (public.hr_trait_pieces_view(v_u, 0)->>'sell_left')::int <> (select sell_day from public.hr_piece_value_rules) then
      raise exception 'VERIFY(c): the section reads %', public.hr_trait_pieces_view(v_u, 0); end if;
    v_g0 := public.hr_purse_of(v_u);
    v := public.hr_piece_sell(0, v_p, v_bid + 1, gen_random_uuid());
    if v->>'error' is distinct from 'quote_changed' or (v->>'gold')::bigint <> v_bid or public.hr_purse_of(v_u) <> v_g0
       or not exists (select 1 from public.trait_pieces where id = v_p) then
      raise exception 'VERIFY(c): a wrong price answered %', v; end if;
    v := public.hr_piece_sell(0, v_p, v_bid, '000000c0-0000-4000-a000-0000071a1176');
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.trait_pieces where id = v_p) or public.hr_purse_of(v_u) <> v_g0 + v_bid
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'shop' and intent = 'piece_sell:' || v_p and gold = v_bid
             and meta->>'piece' = v_p::text and meta->>'base' = v_b) <> 1 then
      raise exception 'VERIFY(c): the sale answered % (purse % -> %)', v->>'error', v_g0, public.hr_purse_of(v_u); end if;
    if exists (select 1 from jsonb_array_elements(v->'pieces'->'pieces') p where p->>'id' = v_p::text) then
      raise exception 'VERIFY(c): the sale''s envelope still lists the piece'; end if;
    v := public.hr_piece_sell(0, v_p, v_bid, '000000c0-0000-4000-a000-0000071a1176');
    if coalesce(v->>'replayed', '') <> 'true' or public.hr_purse_of(v_u) <> v_g0 + v_bid then
      raise exception 'VERIFY(c): a replayed sale paid again: %', v; end if;
    -- the day fuse (rolled back with the probe)
    update public.hr_piece_value_rules set sell_day = 1 where id;
    update public.trait_pieces set escrow = null where id = v_q;
    v := public.hr_piece_sell(0, v_q, v_bid, gen_random_uuid());
    if v->>'error' is distinct from 'sell_day_cap' or not exists (select 1 from public.trait_pieces where id = v_q) then
      raise exception 'VERIFY(c): the day fuse answered %', v; end if;
    if public.hr_piece_sell(0, v_x, v_bid, gen_random_uuid())->>'error' is distinct from 'unknown_piece' then
      raise exception 'VERIFY(c): another account''s piece was sold'; end if;
    raise exception using errcode = 'HRT72', message = 'piece-verbs §6 complete - rolling back';
  exception when sqlstate 'HRT72' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  -- (d) the bodies, the grants, nothing leaked, every switch off
  if position('PIECE-VERBS (1072-piece-verbs.sql)' in (select prosrc from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure)) = 0 then
    raise exception 'VERIFY(d): hr_apply does not carry the piece rule'; end if;
  if exists (select 1 from unnest(array['anon', 'service_role']) g(r)
              where has_function_privilege(g.r, 'public.hr_piece_wear(integer,uuid,text,uuid)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_piece_sell(integer,uuid,bigint,uuid)', 'execute'))
     or not has_function_privilege('authenticated', 'public.hr_piece_wear(integer,uuid,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_piece_sell(integer,uuid,bigint,uuid)', 'execute')
     or exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) g(r)
                 where has_function_privilege(g.r, 'public.hr_piece_store_bid(text,integer,integer)', 'execute')
                    or has_function_privilege(g.r, 'public.hr_trait_pieces_view(uuid,integer)', 'execute')) then
    raise exception 'VERIFY(d): a verb or a helper is reachable by the wrong role'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and (has_function_privilege('hr_engine', 'public.hr_piece_wear(integer,uuid,text,uuid)', 'execute')
          or has_function_privilege('hr_engine', 'public.hr_piece_sell(integer,uuid,bigint,uuid)', 'execute')) then
    raise exception 'VERIFY(d): the engine reaches a client verb'; end if;
  if (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_piece_wear', 'hr_piece_sell')) <> 2 then
    raise exception 'VERIFY(d): the client surface does not name both verbs'; end if;
  perform public.hr_assert_grant_hygiene(true);
  if exists (select 1 from public.player_state where user_id in (v_u, v_o)) or exists (select 1 from public.trait_pieces where user_id in (v_u, v_o))
     or exists (select 1 from public.player_ledger where user_id in (v_u, v_o)) then
    raise exception 'VERIFY(d): §6 LEAKED a probe row'; end if;
  if exists (select 1 from public.hr_flags where key in ('trait_pieces', 'signatures', 'trait_drops') and enabled) then
    raise exception 'VERIFY(d): a switch is lit after the apply'; end if;
  raise notice 'piece-verbs: a worn piece is its own unit on every equip path (never a bag copy), the wear and the store sale prove every property, journalled, replay-safe, dark; all green';
end $$;
