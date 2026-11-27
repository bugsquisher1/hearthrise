/* DECLARED REMOVALS for 1075-work-blocks-midnight.sql (lane/work-blocks-midnight, 2026-11-27: a work window across midnight counts
   each UTC day's own bought blocks).

   HR_APPLY: that file restates hr_apply WHOLE from the CHAIN END (pg_get_functiondef after every file in the apply order before it;
   md5 4f08e462, which is 1040-rested-bank-cut.sql's body plus the two anchored splices since: 1059-company-trades' four WORK-DAY
   edits and 1072-piece-verbs' PIECE-VERBS equip edit) and changes ONE call, the work fold's, which is itself a 1059 line (an
   insertion relative to 1040), so this file removes NOTHING of its own. tests/run-sql-tests.mjs PART 1f-ii diffs it against the
   last STATIC link, 1040, so it sees only what those splices REPLACED on the way to the chain end:
     · WORK_DAY: c_delta_keys' terminator, which 1059 extended with 'work_to'.
     · PIECE_VERBS: the equip loop's body, which 1072 re-nested under the worn-piece branch (each rule kept, re-indented: UNEQUIP,
       bad_equip, the catalogue and slot checks, hr_item_requirement_unmet, the bank debit and credit, the equipment upsert).
   Already in the chain end (both ride the same release, STAGED); this file restates them, it does not make them. GENERATED from
   run-sql-tests' own applyBody and multiset walk (1040 -> this file), the lane's scratch assemble.mjs.

   FROZEN: regenerate only together with the migration, and re-read every line. */
const WORK_DAY = [
  "    'workers', 'workers_accrued_to'];",
];
const PIECE_VERBS = [
  "        if jsonb_typeof(v_eq) = 'null' then",
  "          -- UNEQUIP: return the unit to the bank.",
  "          if v_cur is not null then",
  "            delete from public.player_equipment",
  "             where user_id = v_uid and slot = v_slot and equip_slot = k;",
  "          continue;",
  "          perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));",
  "        v_item := v_eq #>> '{}';",
  "        if v_cur is not null and v_cur = v_item then continue; end if;   -- no-op",
  "        if not exists (select 1 from public.hr_items where item_id = v_item) then",
  "        if not exists (select 1 from public.hr_item_slots",
  "                        where item_id = v_item and equip_slot = k) then",
  "          perform public.hr_reject('wrong_slot',",
  "            jsonb_build_object('item_id', v_item, 'equip_slot', k));",
  "        -- The requirement is re-checked here even though the Edge Function",
  "        -- already checked it. \"The caller checked\" is not a control.",
  "        -- GEAR-BY-LEVEL (2027-01-14-gear-by-level.sql, Tyler 2026-10-24): the catalogue row's requirement,",
  "        -- read by hr_item_requirement_unmet: the hero's Level for every piece of gear, a skill for ammo.",
  "        -- The refusal says what it read (req, need, have): the screen states the server's own numbers.",
  "        if public.hr_item_requirement_unmet(v_uid, v_slot, v_item) is not null then",
  "          perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item)",
  "                                   || public.hr_item_requirement_unmet(v_uid, v_slot, v_item));",
  "        -- DEBIT one from the bank. This is the ownership check; there is",
  "        -- nothing else to check.",
  "        -- CREDIT back whatever was in the slot.",
  "        if v_cur is not null then",
  "          insert into public.player_inventory as pi (user_id, slot, item_id, qty)",
  "            values (v_uid, v_slot, v_cur, 1)",
  "            on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;",
  "        insert into public.player_equipment as pe (user_id, slot, equip_slot, item_id)",
  "          values (v_uid, v_slot, k, v_item)",
  "          on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;",
  "        if jsonb_typeof(v_eq) <> 'string' then",
  "          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));",
  "        select qty into v_have from public.player_inventory",
  "         where user_id = v_uid and slot = v_slot and item_id = v_item for update;",
  "        if coalesce(v_have, 0) < 1 then",
  "          perform public.hr_reject('insufficient_item',",
  "            jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));",
  "        if v_have = 1 then",
  "          delete from public.player_inventory",
  "           where user_id = v_uid and slot = v_slot and item_id = v_item;",
  "        else",
  "          update public.player_inventory set qty = qty - 1",
  "           where user_id = v_uid and slot = v_slot and item_id = v_item;",
  "        end if;",
  "        end if;",
  "        end if;",
  "        end if;",
  "        end if;",
  "        end if;",
  "        end if;",
  "        end if;",
];
export const HR_APPLY = Object.freeze([...WORK_DAY, ...PIECE_VERBS]);
