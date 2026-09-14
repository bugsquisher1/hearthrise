-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-14-inventory-absolute-flag.sql — THE SERVER-SIDE DISARM FOR THE
-- ABSOLUTE-INVENTORY FLIP.
--
-- STAGED. Not applied. Security condition C4 of the flip's GO-WITH-CHANGES.
--
-- ── WHAT IT IS FOR ──────────────────────────────────────────────────────
-- The absolute-inventory flip is the one client change in this codebase that can
-- DELETE a player's item. Every other position on it is a CLIENT constant
-- (INVENTORY_ARM_STAGE in src/data/item-authority.js), so rolling it back meant a
-- redeploy, a cache-buster and a wait for every open tab to reload. A kill switch
-- whose reaction time is a deploy is not a kill switch.
--
-- This adds ONE ROW to the existing `public.hr_flags` table (created by
-- 2026-09-13-town-presence.sql): `inventory_absolute`. `enabled` means "the
-- server PERMITS a client to hold the bag absolutely". An operator flips it to
-- false and every session that reads it thereafter falls back to the merge
-- ratchet — which can only ever over-credit, never delete — with no deploy.
--
-- ── WHY THIS IS A ROW AND NOT AN hr_state_of EDIT ───────────────────────
-- The obvious alternative (stop stamping `inventory_complete`) would need a
-- CREATE OR REPLACE of the largest RPC body in the schema to change one boolean,
-- on the exact day the flip is being rolled out. `hr_flags` already exists, is
-- already client-READABLE (select granted to anon, authenticated), and has NO
-- write policy and NO write grant — not even to service_role, which the town
-- lane revoked precisely so a leaked key could not flip a kill switch. So the
-- only writer is the owner: an operator, deliberately. Nothing else in the
-- schema moves, no client RPC surface changes, and
-- `hr_client_rpc_baseline` / `hr_assert_grant_hygiene` are untouched.
--
-- ── THE DEFAULT, AND WHY IT IS THE SAFE ONE ─────────────────────────────
-- The row goes in `enabled = true` (permitted). That is NOT the flip being armed:
-- the client reads this permission and ANDs it with its own staged constant
-- (shipping 'off'), the five existing arm guards, and the per-envelope
-- `inventory_complete` assertion. This row can only ever SUBTRACT authority.
-- The client's own default is the inverse — an unread flag, a 404 on an older
-- database, an offline tab all answer "not permitted", i.e. merge — so the
-- failure direction on both sides is the one that cannot lose an item.
--
-- `on conflict do nothing`: a chain replay must never silently re-enable a flag
-- an operator has turned off. SAFE TO RE-RUN.
--
-- REVERSING IT (the incident move, no deploy):
--   update public.hr_flags set enabled = false, updated_at = now()
--    where key = 'inventory_absolute';
-- ════════════════════════════════════════════════════════════════════════

insert into public.hr_flags (key, enabled, note) values
  ('inventory_absolute', true,
   'The server-side permission for the client''s absolute-inventory bag '
   '(src/net/accrue.js isInventoryAbsolute). TRUE = permitted; the client still '
   'gates on its own staged constant, the five arm guards and the per-envelope '
   'inventory_complete assertion, so this can only ever subtract authority. '
   'Flip to FALSE to put every session back on the merge ratchet with no deploy.')
on conflict (key) do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- §4 SELF-CHECK — properties asserted by EXECUTING SQL, not by markers.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_enabled boolean;
  v_writable boolean;
begin
  -- (a) THE ROW EXISTS AND IS READABLE BY KEY.
  select enabled into v_enabled from public.hr_flags where key = 'inventory_absolute';
  if v_enabled is null then
    raise exception 'GATE(a): the inventory_absolute flag row was not created';
  end if;

  -- (b) IT IS PERMITTED AT APPLY. A row inserted `false` would disarm a flip that
  --     has not been armed yet — harmless, but it would also mean the switch was
  --     never proven to be in the position this file documents.
  if v_enabled is not true then
    raise exception 'GATE(b): inventory_absolute applied as %, expected true', v_enabled;
  end if;

  -- (c) NO CLIENT ROLE MAY WRITE IT. A kill switch a client can flip is an
  --     authority grant wearing a kill switch's name. Checked per role and per
  --     privilege rather than trusted from the town lane's apply.
  select bool_or(has_table_privilege(r, 'public.hr_flags', p))
    into v_writable
    from unnest(array['anon', 'authenticated', 'service_role']) r
    cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) p;
  if coalesce(v_writable, false) then
    raise exception 'GATE(c): a client role can write public.hr_flags — the disarm is not operator-only';
  end if;

  -- (d) IT IS READABLE BY THE CLIENT, or the switch is invisible to the thing it
  --     is supposed to stop.
  if not has_table_privilege('authenticated', 'public.hr_flags', 'SELECT') then
    raise exception 'GATE(d): authenticated cannot SELECT public.hr_flags — the client could never read the disarm';
  end if;

  -- (e) IDEMPOTENT. A second apply must not disturb an operator's decision:
  --     turn it off, re-run the insert, and it must still be off.
  update public.hr_flags set enabled = false where key = 'inventory_absolute';
  insert into public.hr_flags (key, enabled, note) values ('inventory_absolute', true, 'replay probe')
  on conflict (key) do nothing;
  select enabled into v_enabled from public.hr_flags where key = 'inventory_absolute';
  if v_enabled is not false then
    raise exception 'GATE(e): a re-apply re-enabled a flag an operator had turned OFF — a silent outage on every replay';
  end if;
  update public.hr_flags set enabled = true, updated_at = now() where key = 'inventory_absolute';

  raise notice 'inventory-absolute-flag self-check: all gates passed';
end $$;
