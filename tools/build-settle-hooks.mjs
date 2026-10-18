#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/build-settle-hooks.mjs — WRITES supabase/migrations/2026-10-25-settle-hooks.sql
// (lane S2). A one-time AUTHORING tool, not a generator: the file it writes is a
// literal, self-describing migration (whole function bodies, nothing patched at
// apply time) and is reviewed as SQL. It exists so the six restated bodies are
// the S1 bodies the chain really runs plus the named hook calls, byte for byte,
// and so the §0 pins are measured rather than typed.
//
//   node tools/build-settle-hooks.mjs          (re)write the file
//   node tools/build-settle-hooks.mjs --check  exit 1 if the file is not what it would write
//
// How: replay the chain up to the last file BEFORE settle-hooks, read each
// pre-image (pg_get_functiondef + md5(prosrc)), apply the edits below (each must
// match exactly once), write the file, apply it to that replay, and read the
// post-image md5s into the §0 pins.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootReplay, ROOT } from '../tests/schema-replay.mjs';
import { isMain } from '../tests/_is-main.mjs';

export const FILE = '2026-10-25-settle-hooks.sql';
const OUT = join(ROOT, 'supabase', 'migrations', FILE);
const BEFORE = '2026-10-25-party-invites.sql';

/* [regprocedure, grants SQL, [find, replace] edits]. */
export const FNS = [
  ['public.hr_apply(uuid,integer,bigint,uuid,jsonb)',
    `revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;`,
    [[`            jsonb_build_object('item_id', k, 'have', v_have, 'need', -v_n));
        end if;
        if v_have + v_n = 0 then`, `            jsonb_build_object('item_id', k, 'have', v_have, 'need', -v_n));
        end if;
        -- A LOCKED ITEM IS NEVER SOLD TO THE NPC (hook: hr_item_locked, 2026-10-25-bag-rules.sql).
        if v_n < 0 and coalesce(v_this_intent, '') ~ '^vendor_sell(_many)?(:|$)' and public.hr_item_locked(v_uid, v_slot, k) then
          perform public.hr_reject('item_locked', jsonb_build_object('item_id', k));
        end if;
        if v_have + v_n = 0 then`]]],
  ['public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
    `revoke execute on function public.hr_hunt_apply_member(uuid, uuid, int, uuid, uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.hr_hunt_apply_member(uuid, uuid, int, uuid, uuid, jsonb, jsonb, jsonb) from anon, authenticated, service_role, hr_engine, hr_tick;`,
    [['  v_unit_id int;\n', `  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
`],
    [`      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;`,
     `      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;`],
    [`  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);`,
     `  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);`],
    [`  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       > v_win / v_cons + 1`,
     `  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1`],
    [`  -- (6) THE PRICE OF THE FALLS, RE-CHECKED AND DEBITED: each fall's share is at`,
     `  -- BLESSINGS (hook: hr_blessing_take): the window's first fall keeps only the unprotected
  -- share of its loss; the tiers it used (held since before the window began) are used up.
  if v_nd > 0 then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE FALLS, RE-CHECKED AND DEBITED: each fall's share is at`],
    [`  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  return v_h;`,
     `  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  -- The debited (blessed) loss per fall travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end;`]]],
  ['public.hr_hunt_member_read(public.hunt_sessions)',
    'revoke execute on function public.hr_hunt_member_read(public.hunt_sessions) from public, anon, authenticated, service_role;',
    [[`                 from public.hr_hunt_cover_items c
                 left join public.hunt_session_tally t on t.session_id = p_s.id), '{}'::jsonb))`,
      `                 from public.hr_hunt_cover_items c
                 left join public.hunt_session_tally t on t.session_id = p_s.id
                -- NEVER A LOCKED ITEM (hook: hr_item_locked, 2026-10-25-bag-rules.sql).
                where not public.hr_item_locked(p_s.user_id, p_s.slot, c.item_id)), '{}'::jsonb))`]]],
  ['public.hr_hunt_party_view(uuid,integer)',
    'revoke execute on function public.hr_hunt_party_view(uuid, int) from public, anon, authenticated, service_role;',
    [[`'name', coalesce((select pr.display_name from public.profiles pr where pr.id = v_r.user_id), 'Adventurer'),`,
      `'name', public.hr_character_name(v_r.user_id, v_r.slot),`]]],
  ['public.hr_hunt_party_finder(integer,text,text)',
    `revoke execute on function public.hr_hunt_party_finder(int, text, text) from public;
revoke execute on function public.hr_hunt_party_finder(int, text, text) from anon, service_role;
grant  execute on function public.hr_hunt_party_finder(int, text, text) to authenticated;`,
    [[`'name', coalesce((select pr.display_name from public.profiles pr where pr.id = m.user_id), 'Adventurer'))`,
      `'name', public.hr_character_name(m.user_id, m.slot))`]]],
  ['public.hr_hunt_section_view(uuid,integer)',
    'revoke execute on function public.hr_hunt_section_view(uuid, int) from public, anon, authenticated, service_role;',
    [[`'name', coalesce((select pr.display_name from public.profiles pr where pr.id = p_user), 'Adventurer'),`,
      `'name', public.hr_character_name(p_user, p_slot),`]]],
];

const HEADER = `-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE S2 SETTLE HOOKS: SIX S1 BODIES RESTATED WHOLE WITH NAMED CALLS
-- (lane S2, 2026-10-18; the S2 architecture check: no function body is patched
-- at apply time). STAGED. Game CLOSED: applies on its passing §3; Security
-- reviews it with every S2 money surface in the reopen gate.
-- Written by tools/build-settle-hooks.mjs (--check) from the bodies the chain
-- runs before this file; reviewed as the SQL below.
--
-- ── WHAT EACH RESTATEMENT ADDS (and nothing else moves) ────────────────────
-- hr_apply                a vendor_sell / vendor_sell_many debit of a locked item
--                         is refused \`item_locked\` (hook hr_item_locked).
-- hr_hunt_apply_member    a cover line naming a locked item is refused
--                         \`item_locked\`; THE LOOT FILTER (hook hr_hunt_loot_rules,
--                         after sell-to-cover, its gold through hr_apply); own
--                         drinks (kind 'mana') share the one consumable lane with
--                         food; BLESSINGS (hook hr_blessing_take, before the
--                         death-XP debit); the answer carries death_xp (the debited
--                         loss per fall), the number a death explanation shows.
-- hr_hunt_member_read     sell-to-cover never offers a locked item.
-- hr_hunt_party_view, hr_hunt_party_finder, hr_hunt_section_view
--                         the name players see is hr_character_name (per character).
-- The hooks live with their features: 2026-10-25-bag-rules.sql (hr_item_locked,
-- hr_hunt_loot_rules), 2026-10-25-blessings.sql (hr_blessing_take),
-- 2026-10-25-account-items.sql (hr_character_name).
--
-- ── THE PINS (§0) ───────────────────────────────────────────────────────────
-- Each body is replaced only over the S1 pre-image it was written from (md5 of
-- prosrc) or this file's own image; anything else moved meanwhile and is
-- refused, never clobbered. CREATE OR REPLACE keeps every grant; each is
-- re-asserted.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the S1 bodies: hr_apply from 2026-10-22-hunt-sessions-delete-away.sql,
-- hr_hunt_apply_member / hr_hunt_member_read / hr_hunt_section_view from
-- 2026-10-23-hunt-world-state.sql, hr_hunt_party_view / hr_hunt_party_finder from
-- 2026-10-23-hunt-party.sql. ORDER: after 2026-10-25-party-invites.sql (LAST S2
-- file). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════
`;

function pins(pre, post) {
  const rows = FNS.map(([fn], i) => `    ('${fn}', '${pre[i]}', '${post[i]}')`).join(',\n');
  return `
-- ── §0 THE PINS ──────────────────────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_item_locked(uuid,integer,text)') is null
     or to_regprocedure('public.hr_hunt_loot_rules(uuid,integer,uuid,uuid,jsonb,timestamp with time zone)') is null
     or to_regprocedure('public.hr_blessing_take(uuid,integer,uuid,jsonb,timestamp with time zone)') is null
     or to_regprocedure('public.hr_character_name(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2026-10-25-bag-rules.sql, -blessings.sql and -account-items.sql first (the hooks)'; end if;
  for v_r in select * from (values
${rows}) t(fn, pre, post) loop
    select md5(prosrc) into v_md5 from pg_proc where oid = v_r.fn::regprocedure;
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its S1 pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;
`;
}

const SELFCHECK = (post) => `
-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-00005e310001';
  v jsonb; v_item text; v_role text; v_r record;
begin
  -- (a) every body is this file's image.
  for v_r in select * from (values
${FNS.map(([fn], i) => `    ('${fn}', '${post[i]}')`).join(',\n')}) t(fn, post) loop
    if (select md5(prosrc) from pg_proc where oid = v_r.fn::regprocedure) is distinct from v_r.post then
      raise exception 'VERIFY(a): % is not this file''s image', v_r.fn; end if;
  end loop;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'settle-hooks §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    -- A cover item: the catalogue's, else a probe row (sell-to-cover is inert while none is flagged junk).
    v_item := (select c.item_id from public.hr_hunt_cover_items c order by c.unit desc, c.item_id limit 1);
    if v_item is null then
      v_item := (select vv.item_id from public.hr_hunt_vendor_value vv order by vv.unit, vv.item_id limit 1);
      insert into public.hr_hunt_cover_items (item_id, unit) values (v_item, 1);
    end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_item, 5)
      on conflict (user_id, slot, item_id) do update set qty = 5;
    v := public.hr_item_lock(0, v_item, true, '000000c0-0000-4000-a000-00005e310101');
    -- (b) THE COUNTER: a vendor sale of the locked item is refused; a non-sale debit of it is not.
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), gen_random_uuid(),
           jsonb_build_object('gold', 1, 'items', jsonb_build_object(v_item, -1),
                              'journal', jsonb_build_object('kind', 'shop', 'intent', 'vendor_sell_many:probe')));
    if v->>'error' is distinct from 'item_locked' then raise exception 'VERIFY(b): selling a locked item answered %', v; end if;
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), gen_random_uuid(),
           jsonb_build_object('items', jsonb_build_object(v_item, -1), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe_spend')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): a non-sale debit of a locked item answered %', v; end if;
    -- (c) THE COVER READ never offers a locked item; unlocked, it offers it (the session's loot of it).
    insert into public.hunt_sessions (id, user_id, slot, hunt_id, preset, falls_limit, entered_at, hunt_from, settled_to, next_swing_at)
      select '000000c0-0000-4000-a000-00005e310199', v_u, 0, t.hunt_id, 0, 3, now(), now(), now(), now()
        from public.hr_hunt_travel t order by t.hunt_id limit 1;
    insert into public.hunt_session_tally (session_id, user_id, slot, loot)
      values ('000000c0-0000-4000-a000-00005e310199', v_u, 0, jsonb_build_object(v_item, 3));
    v := public.hr_hunt_member_read((select h from public.hunt_sessions h where h.id = '000000c0-0000-4000-a000-00005e310199'));
    if v->'cover' ? v_item then raise exception 'VERIFY(c): sell-to-cover offers a locked item: %', v->'cover'->v_item; end if;
    v := public.hr_item_lock(0, v_item, false, '000000c0-0000-4000-a000-00005e310102');
    v := public.hr_hunt_member_read((select h from public.hunt_sessions h where h.id = '000000c0-0000-4000-a000-00005e310199'));
    if not coalesce(v->'cover' ? v_item, false) or (v->'cover'->v_item->>'avail')::int <> 3 then
      raise exception 'VERIFY(c): the unlocked cover item reads %', v->'cover'->v_item; end if;
    raise exception using errcode = 'HR880', message = 'settle-hooks §3 complete - rolling back';
  exception when sqlstate 'HR880' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(d): §3 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_member_read(public.hunt_sessions)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_party_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_section_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(d): % reaches a restated internal', v_role; end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hunt_party_finder(integer,text,text)', 'execute') then
    raise exception 'VERIFY(d): a restated grant was lost'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'settle-hooks: six bodies restated whole over their S1 pins, the hooks called by name; all green';
end $$;
`;

async function build() {
  const { db } = await bootReplay({ upTo: BEFORE });
  const pre = [], bodies = [];
  for (const [fn, , edits] of FNS) {
    const r = (await db.query('select pg_get_functiondef($1::regprocedure) d, md5(prosrc) h from pg_proc where oid = $1::regprocedure', [fn])).rows[0];
    let body = String(r.d).split('\r').join('');
    for (const [a, b] of edits) {
      const n = body.split(a).length - 1;
      if (n !== 1) throw new Error(`${fn}: an edit matched ${n} times (need 1): ${a.slice(0, 80)}`);
      body = body.replace(a, () => b);
    }
    pre.push(r.h); bodies.push(body.replace(/\s*$/, ''));
  }
  const fnSql = FNS.map(([fn, grants], i) => `\n-- ── §1.${i + 1} ${fn.replace(/^public\./, '').replace(/\(.*$/, '')} ──\n${bodies[i]};\n${grants}\n`).join('');
  const draft = (post) => HEADER + pins(pre, post) + '\n-- ── §1 THE SIX BODIES ────────────────────────────────────────────────────────' + fnSql + SELFCHECK(post);
  /* Measure the post-images on the replay itself. */
  await db.exec(fnSql);
  const post = [];
  for (const [fn] of FNS) post.push((await db.query('select md5(prosrc) h from pg_proc where oid = $1::regprocedure', [fn])).rows[0].h);
  await db.close().catch(() => {});
  return draft(post);
}

async function main() {
  const text = await build();
  if (process.argv.includes('--check')) {
    let have = ''; try { have = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'); } catch { /* absent */ }
    if (have !== text) { console.error(`build-settle-hooks --check FAILED: ${FILE} is not what the builder writes. Run: node tools/build-settle-hooks.mjs`); process.exit(1); }
    console.log(`build-settle-hooks --check: ${FILE} matches`);
    return;
  }
  writeFileSync(OUT, text);
  console.log('wrote ' + OUT);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error('build-settle-hooks: ' + e.message); process.exit(1); });
