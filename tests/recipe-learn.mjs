#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/recipe-learn.mjs — A RECIPE IS LEARNED ON THE SERVER, OR THE NIGHT
//                          DOES NOT PAY FOR IT.
//
//   node tests/recipe-learn.mjs             # the guard
//   node tests/recipe-learn.mjs --list      # the mutation catalogue
//   node tests/recipe-learn.mjs --mutate=X  # one arm
//   node tests/recipe-learn.mjs --selftest  # every mutation must turn it RED
//
// Ships with: supabase/migrations/2026-09-14-recipe-learn.sql
//
// ── THE BUG IT CLOSES ───────────────────────────────────────────────────────
// 2026-08-16-artisan-progress-model.sql built the STORAGE for a learned recipe
// (player_progress kind='flag' key='recipe:<scroll_id>', catalogued in
// hr_unlocks, read back by hr_perks_of as `unlockedRecipes`) and left the WRITE
// to a later author who never arrived. Nothing has ever written a recipe flag,
// for anybody. So:
//   ATTENDED — src/legacy.js's addItem wrapper sets G.unlockedRecipes[id] (the
//     RESIDUE) and deletes the scroll locally. The recipe unlocks. Nothing is
//     sent anywhere.
//   AWAY — supabase/functions/hr-accrue reads hr_perks_of.unlockedRecipes ({}
//     for everybody) into src/core/artisan-sim.js, whose gateOk STOPS the span at
//     tick 0. All eight gated recipes pay NOTHING for the night.
// The browser says learned, the server says locked, and a cloud restore un-learns
// a recipe whose scroll is already gone (CLAUDE.md §6, 2026-09-14).
//
// ── WHAT THIS GUARD DRIVES (no credentials, real PostgreSQL) ────────────────
// The REAL migration chain from tests/schema-apply-order.json applied verbatim
// into PGlite, a real character through the REAL verb, and then the REAL ENGINE
// READER — src/core/artisan.js `gateOk`, the same pure function the away
// simulation and the browser both call — pointed at the envelope this migration
// projects. A projection the engine cannot consume is the bug with an extra key
// on it, which is why R5 (envelope = verdict = hr_perks_of) and R9 (gateOk flips)
// are the two assertions that matter most.
//
// ── WHY R1 IS FIRST ─────────────────────────────────────────────────────────
// Everything below is either "nothing moved" or "the gate opened", and all of it
// passes trivially against an empty catalogue. R1 binds the nine catalogued
// scrolls to src/data in both directions first.
//
// Exit: 0 green · 1 a real problem · 2 harness problem.
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { bootReplay } from './schema-replay.mjs';

/* A URL, not the filesystem path schema-replay.mjs exports — `new URL(rel, path)`
   throws on Windows, and this file loads three real repo modules by URL. */
const ROOT = new URL('../', import.meta.url);

const MIG = '2026-09-14-recipe-learn.sql';
const UID = '000000e2-0000-0000-0000-0000000000e2';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  x ${msg}`); } };

/* ── THE GATE-BLIND PAIR ───────────────────────────────────────────────────
   Every mutation is ALSO run with the migration's own §5 commit gate short-
   circuited. A tick that only means "the apply threw" proves the MIGRATION can
   fail, not that THIS GUARD can see anything — and §5 fires once, at apply time.
   The regression that actually brings the bug back is a LATER migration
   restating hr_state_of from a stale template, at which point §5 never runs
   again and this file is the only thing left standing. */
const GATE_BLIND = [
  `  raise notice 'recipe-learn: hr_state_of projects unlocked_recipes`,
  `  return;
exception when others then
  raise notice 'Sec 5 SHORT-CIRCUITED FOR THE MUTATION PROOF: %', sqlerrm;
end $$;
do $$ begin
  raise notice 'recipe-learn: hr_state_of projects unlocked_recipes`,
];

const MUTATIONS = {
  projection_key_renamed: {
    by: 'R2/R9',
    why: 'THE SHIPPED BUG under a new name: hr_state_of projects the learned set under a key the '
       + 'client does not read, so the artisan gate keeps living in the residue and the away engine '
       + 'keeps stopping at tick 0',
    find: `    'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot),$new$);`,
    repl: `    'unlockedRecipes', public.hr_recipes_of(p_user, v_st.slot),$new$);`,
  },
  reader_drops_the_catalogue_join: {
    by: 'R11',
    why: 'hr_recipes_of stops joining hr_unlocks, so ANY player_progress flag whose key starts '
       + '"recipe:" becomes a learned recipe — a mis-filed or uncatalogued row turns into a '
       + 'capability, which is precisely what the join makes invisible as well as refused',
    find: `    join public.hr_unlocks u
      on  u.unlock_id = pp.key
      and u.namespace = 'recipe'
      and u.progress_kind = pp.kind`,
    repl: `    left join public.hr_unlocks u
      on  u.unlock_id = pp.key`,
  },
  reader_fails_open: {
    by: 'R2',
    why: 'the reader returns every CATALOGUED recipe instead of the ones this character learned — '
       + 'the fail-OPEN direction, which hands eight gated recipes to everybody and makes every '
       + '"nothing moved" assertion below pass for the wrong reason. (The whole body is swapped '
       + 'rather than a predicate widened: with no other character in the fixture, an `or true` on '
       + 'the user filter selects the same zero rows and the arm would prove nothing — measured.)',
    find: `  select coalesce(jsonb_object_agg(substring(pp.key from 8), true), '{}'::jsonb)
    from public.player_progress pp
    join public.hr_unlocks u
      on  u.unlock_id = pp.key
      and u.namespace = 'recipe'
      and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = coalesce(p_slot, 0)
     and pp.period_key = ''
     and pp.value  > 0
     and p_user is not null;`,
    repl: `  select coalesce(jsonb_object_agg(substring(u.unlock_id from 8), true), '{}'::jsonb)
    from public.hr_unlocks u
   where u.namespace = 'recipe'
     and p_user is not null
     and coalesce(p_slot, 0) >= 0;`,
  },
  already_learned_check_removed: {
    by: 'R6',
    why: 'a SECOND scroll of a recipe you already know is eaten for nothing — the player loses a '
       + 'tradeable drop to a no-op, and the refusal that protects them is the ordering, not the '
       + 'storage rule',
    find: `  if (public.hr_recipes_of(v_uid, v_slot)) ? p_item then`,
    repl: `  if (public.hr_recipes_of(v_uid, v_slot)) ? p_item and false then`,
  },
  consume_skipped: {
    by: 'R4',
    why: 'the flag is granted without consuming the scroll, so one scroll learns a recipe AND stays '
       + 'in the bag — a tradeable item duplicated by a capability grant',
    find: `  if v_have = 1 then
    delete from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = p_item;
  else
    update public.player_inventory set qty = v_have - 1
     where user_id = v_uid and slot = v_slot and item_id = p_item;
  end if;`,
    repl: `  if v_have = 1 and false then
    delete from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = p_item;
  end if;`,
  },
  consume_takes_the_whole_stack: {
    by: 'R4',
    why: 'the consume deletes the stack rather than one unit, so a player holding three scrolls '
       + 'loses all three to one read — the opposite error from consume_skipped and just as '
       + 'invisible without a stack of two in the probe',
    find: `    update public.player_inventory set qty = v_have - 1
     where user_id = v_uid and slot = v_slot and item_id = p_item;`,
    repl: `    delete from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = p_item;`,
  },
  insufficient_item_check_removed: {
    by: 'R3',
    why: 'a recipe can be learned with an EMPTY BAG — the capability becomes free, and the scroll '
       + 'drop it was balanced around stops being a price at all',
    find: `  if v_have < 1 then`,
    repl: `  if v_have < 1 and false then`,
  },
  catalogue_check_removed: {
    by: 'R7',
    why: 'an uncatalogued id is accepted, so a forged p_item writes a player_progress flag nothing '
       + 'polices — the row shape is the allowlist, and this removes the allowlist',
    find: `  if v_name is null
     or not exists (select 1 from public.hr_items i where i.item_id = p_item) then`,
    repl: `  if v_name is null and false then`,
  },
  version_not_bumped: {
    by: 'R4',
    why: 'the character version does not advance, so a client holding the old one never reconciles '
       + 'and the newly learned recipe is invisible until something else bumps it',
    find: `  update public.player_state
     set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;`,
    repl: `  update public.player_state
     set updated_at = now()
   where user_id = v_uid and slot = v_slot;`,
  },
  idempotency_replay_skipped: {
    by: 'R6',
    why: 'the replay cache is not consulted, so a retried gesture (a flaky network, a double tap) '
       + 'eats a second scroll for one read',
    find: `  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;`,
    repl: `  if v_cached is not null and false then
    return v_cached || jsonb_build_object('replayed', true);
  end if;`,
  },
  rejection_seam_dropped: {
    by: 'R0',
    why: 'the wrapper stops decorating its refusals, so every refused learn is invisible in '
       + 'hr_rejections and vitals.mjs reads zero for a surface that is failing '
       + '(tests/rejections-journal.mjs P6 sweeps chain end for exactly this)',
    find: `  return public.hr_note_rejection('hr_recipe_learn', p_slot,
           public.hr_recipe_learn__ungated($1, $2, $3));`,
    repl: `  return public.hr_recipe_learn__ungated($1, $2, $3);`,
  },
  ungated_verb_granted_to_clients: {
    by: 'R0',
    why: 'the UNGATED twin is left executable by authenticated, so the rate gate is one POST away '
       + 'from being bypassed entirely — the whole point of the wrapper',
    find: `revoke execute on function public.hr_recipe_learn__ungated(text, int, uuid)
  from anon, authenticated, service_role;`,
    repl: `grant execute on function public.hr_recipe_learn__ungated(text, int, uuid)
  to authenticated;`,
  },
};

const NEGATIVE_CONTROL = {
  find: `-- ── 1. player_ledger.kind must admit 'recipe' — PROGRAMMATIC, ADDITIVE ────`,
  repl: `-- ── 1. player_ledger.kind must admit 'recipe' (comment-only control) ──────`,
};

async function boot(mutate, gateBlind, extra) {
  const pairs = [];
  if (mutate) pairs.push([MUTATIONS[mutate].find, MUTATIONS[mutate].repl]);
  if (extra) pairs.push([extra.find, extra.repl]);
  if (gateBlind) pairs.push(GATE_BLIND);
  const { db } = pairs.length
    ? await bootReplay({ patches: new Map([[MIG, pairs]]) })
    : await bootReplay();
  return db;
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

async function runAll(db) {
  const q = (sql, p) => one(db, sql, p);

  // ── R1. THE CATALOGUE IS src/data, IN BOTH DIRECTIONS ───────────────────
  const { ITEMS } = await import(new URL('src/data/items.js', ROOT).href);
  const { ARTISAN_RECIPES } = await import(new URL('src/data/recipes.js', ROOT).href);
  const { gateOk } = await import(new URL('src/core/artisan.js', ROOT).href);
  ok(typeof gateOk === 'function',
     'src/core/artisan.js exports gateOk — the REAL reader the away engine and the browser share');

  const catalogued = (await db.query(
    "select unlock_id, substring(unlock_id from 8) as item from public.hr_unlocks "
    + "where namespace = 'recipe' and progress_kind = 'flag' order by unlock_id")).rows;
  ok(catalogued.length > 0, 'hr_unlocks catalogues at least one recipe scroll');
  const authored = Object.keys(ITEMS).filter((id) => ITEMS[id] && ITEMS[id].recipe).sort();
  ok(catalogued.length === authored.length,
     `hr_unlocks carries ${catalogued.length} recipe scrolls, src/data/items.js authors ${authored.length}`);
  for (const r of catalogued) {
    ok(authored.includes(r.item),
       `hr_unlocks catalogues "${r.item}", which src/data/items.js does not mark as a recipe scroll`);
    const inItems = await q('select 1 as x from public.hr_items where item_id = $1', [r.item]);
    ok(!!inItems, `${r.item} is a real row in hr_items — otherwise the bag could never hold it`);
  }
  for (const id of authored) {
    ok(catalogued.some((r) => r.item === id),
       `src/data/items.js authors recipe scroll "${id}" and hr_unlocks omits it`);
  }

  // THE PROBE SCROLL: one that a REAL gated recipe depends on, so R9 can flip a
  // gate the shipped engine actually reads. Derived, never named — a hardcoded
  // id would rot the first time the designer retires a scroll.
  let probe = null;
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) {
    for (const rec of list) {
      if (rec.gated && catalogued.some((r) => r.item === rec.gated)) {
        probe = { item: rec.gated, recipe: rec, skill };
        break;
      }
    }
    if (probe) break;
  }
  ok(!!probe, 'at least one shipped ARTISAN_RECIPES entry is gated on a catalogued scroll — without '
     + 'one, R9 would prove nothing about the engine');
  if (!probe) return;

  // ── R0. NOTHING BECAME CLIENT-REACHABLE ─────────────────────────────────
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const sig of ['public.hr_recipe_learn__ungated(text,int,uuid)',
                       'public.hr_recipes_of(uuid,int)',
                       'public.hr_state_of(uuid,int)']) {
      const r = await q("select has_function_privilege($1, $2, 'execute') as p", [role, sig]);
      ok(r.p === false, `${sig} is NOT executable by ${role}`);
    }
  }
  ok((await q("select has_function_privilege('authenticated', 'public.hr_recipe_learn(text,int,uuid)', 'execute') as p")).p === true,
     'hr_recipe_learn IS executable by authenticated (otherwise the intent is dead)');
  ok((await q("select has_function_privilege('anon', 'public.hr_recipe_learn(text,int,uuid)', 'execute') as p")).p === false,
     'hr_recipe_learn is NOT executable by anon');
  const seam = await q(`select (select count(*) from regexp_matches(p.prosrc, 'hr_note_rejection\\(', 'g')) as n
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='hr_recipe_learn'`);
  ok(Number(seam.n) === 1,
     `the wrapper carries ${seam && seam.n} hr_note_rejection calls (need exactly 1)`);

  // ── THE FIXTURE ─────────────────────────────────────────────────────────
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${UID}', false)`);
  const created = (await q('select public.hr_create_character(0) as r')).r;
  ok(created && created.created === true, `the probe character was created (${JSON.stringify(created)})`);

  /* A raised SQL error is an ANSWER, not a reason to abandon the run — a defect
     that makes the verb violate a constraint would otherwise be reported as a
     harness failure, which is indistinguishable from "the guard cannot see it". */
  const learn = async (item, idem) => {
    try {
      return (await q('select public.hr_recipe_learn__ungated($1::text, 0, $2::uuid) as r',
        [item, idem])).r;
    } catch (e) { return { ok: false, error: 'RAISED', raised: String(e && e.message).split(String.fromCharCode(10))[0] }; }
  };
  const envelope = async () => (await q('select public.hr_state_of($1::uuid, 0) as e', [UID])).e || {};
  const learned = async () => {
    const e = await envelope();
    return (e.unlocked_recipes && typeof e.unlocked_recipes === 'object') ? e.unlocked_recipes : null;
  };
  const qty = async () => Number((await q(
    'select coalesce(qty, 0) as q from public.player_inventory where user_id=$1 and slot=0 and item_id=$2',
    [UID, probe.item])) ?.q || 0);
  const ledger = async () => (await db.query(
    "select meta from public.player_ledger where user_id=$1 and kind='recipe' order by at, id", [UID])).rows;
  const version = async () => Number((await q(
    'select version from public.player_state where user_id=$1 and slot=0', [UID])).version);

  // ── R2. FAIL-CLOSED BY SHAPE, AND THE ENVELOPE SAYS SO ──────────────────
  {
    const e = await envelope();
    ok(Object.prototype.hasOwnProperty.call(e, 'unlocked_recipes'),
       'a fresh character\'s envelope CARRIES the unlocked_recipes key — "locked" and "the server '
       + 'has no opinion" are different facts and only one of them is renderable');
    const set = await learned();
    ok(set !== null && typeof set === 'object' && !Array.isArray(set),
       `unlocked_recipes is an OBJECT (the { "<id>": true } shape gateOk indexes), got ${JSON.stringify(e.unlocked_recipes)}`);
    ok(set !== null && Object.keys(set).length === 0,
       `a fresh character has learned nothing (got ${JSON.stringify(set)})`);
    const direct = (await q('select public.hr_recipes_of($1::uuid, 0) as s', [UID])).s;
    ok(JSON.stringify(direct) === JSON.stringify(set),
       'the envelope key IS hr_recipes_of\'s answer, not a second computation');
    // R9, the CLOSED half: the shipped engine reader agrees the recipe is locked.
    ok(gateOk(probe.recipe, set) === false,
       `src/core/artisan.js gateOk says ${probe.recipe.id} is LOCKED for a character that has not `
       + 'read the scroll — this is the away engine\'s own predicate, not a restatement of it');
  }

  // ── R3. NO SCROLL, NO LEARN ─────────────────────────────────────────────
  {
    const r = await learn(probe.item, null);
    ok(r && r.error === 'insufficient_item',
       `learning ${probe.item} with an empty bag answered ${JSON.stringify(r)} — it must be insufficient_item`);
    ok(Object.keys(await learned() || {}).length === 0, 'the refused learn granted nothing');
    ok((await ledger()).length === 0, 'the refused learn journalled nothing');
  }

  // ── R7. A FORGED ID LEARNS NOTHING ──────────────────────────────────────
  {
    const r = await learn('recipe_for_infinite_gold', null);
    ok(r && r.error === 'unknown_recipe', `an uncatalogued id answered ${JSON.stringify(r)}`);
    const flags = (await db.query(
      "select key from public.player_progress where user_id=$1 and kind='flag' and key like 'recipe:%'",
      [UID])).rows;
    ok(flags.length === 0, `an uncatalogued id wrote ${flags.length} flag row(s)`);
  }

  // ── R11. A MIS-FILED ROW IS NOT A CAPABILITY ────────────────────────────
  // Written straight into player_progress (which no client may do — this probe
  // is the owner), under a key the CATALOGUE does not carry. The join is what
  // makes it invisible, and without the join it would silently open a recipe.
  {
    await db.exec(`insert into public.player_progress (user_id, slot, kind, key, value, period_key)
                   values ('${UID}', 0, 'flag', 'recipe:not_a_real_scroll', 1, '')
                   on conflict (user_id, slot, kind, key, period_key) do update set value = 1;`);
    const set = await learned();
    ok(set !== null && !Object.prototype.hasOwnProperty.call(set, 'not_a_real_scroll'),
       `an UNCATALOGUED recipe: flag row became a learned recipe (${JSON.stringify(set)}) — the `
       + 'hr_unlocks join is the allowlist, and without it any flag whose key starts "recipe:" is a '
       + 'capability');
    await db.exec(`delete from public.player_progress
                    where user_id = '${UID}' and key = 'recipe:not_a_real_scroll';`);
  }

  // ── R4. THE HAPPY PATH — exactly ONE of TWO scrolls is consumed ─────────
  const IDEM = '000000e2-0000-0000-0000-0000000000a2';
  await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                 values ('${UID}', 0, '${probe.item}', 2)
                 on conflict (user_id, slot, item_id) do update set qty = 2;`);
  const v0 = await version();
  {
    const r = await learn(probe.item, IDEM);
    ok(r && r.ok === true, `learning ${probe.item} with a scroll in the bag was refused: ${JSON.stringify(r)}`);
    ok((await qty()) === 1,
       `the consume left ${await qty()} of 2 scrolls — it must take exactly one (0 is a stack wipe, `
       + '2 is a duplication)');
    ok(r && r.unlocked_recipes && r.unlocked_recipes[probe.item] === true,
       'the verb\'s own answer carries the recipe just learned');
    const flag = await q(`select value from public.player_progress
       where user_id=$1 and slot=0 and kind='flag' and key=$2 and period_key=''`, [UID, `recipe:${probe.item}`]);
    ok(flag && Number(flag.value) > 0, 'a kind=flag row was written');
    ok((await version()) > v0,
       'the character version advanced — a client holding the old one would otherwise never reconcile');
  }

  // ── R5. THE THREE READERS AGREE (the one that decides whether the night pays) ──
  {
    const env = await learned();
    const perks = (await q('select public.hr_perks_of($1::uuid, 0) as p', [UID])).p;
    ok(perks && perks.ok === true, `hr_perks_of answered ${JSON.stringify(perks && perks.error)} for the probe`);
    ok(JSON.stringify(perks && perks.unlockedRecipes) === JSON.stringify(env),
       `the AWAY engine's set (${JSON.stringify(perks && perks.unlockedRecipes)}) and the envelope's `
       + `(${JSON.stringify(env)}) disagree — the browser would show a recipe the night refuses to craft`);
    // R9, the OPEN half: the shipped engine reader now opens the gate off the
    // envelope the server projects. This is the whole point of the migration.
    ok(gateOk(probe.recipe, env) === true,
       `src/core/artisan.js gateOk still says ${probe.recipe.id} is locked AFTER the server recorded `
       + 'the learn — the projection is not consumable by the engine that reads it');
    ok(gateOk(probe.recipe, perks && perks.unlockedRecipes) === true,
       'gateOk also opens off hr_perks_of, which is the object hr-accrue actually passes in');
  }

  // ── R8. ONE JOURNAL ROW ─────────────────────────────────────────────────
  {
    const l = await ledger();
    ok(l.length === 1, `${l.length} ledger rows for one scroll read (need exactly 1)`);
    ok(l[0] && l[0].meta.item === probe.item, 'the journal names the scroll consumed');
  }

  // ── R6. A RE-LEARN AND A REPLAY BOTH EAT NOTHING ────────────────────────
  {
    const again = await learn(probe.item, null);
    ok(again && again.error === 'already_learned',
       `re-learning with a FRESH key answered ${JSON.stringify(again)} — it must be already_learned`);
    ok((await qty()) === 1, 'the refused re-learn ATE THE SECOND SCROLL');

    const replay = await learn(probe.item, IDEM);
    ok(replay && replay.replayed === true,
       `the replayed key was not answered from the cache: ${JSON.stringify(replay)}`);
    ok((await qty()) === 1, 'the replay CONSUMED a second scroll');
    ok((await ledger()).length === 1, 'the replay wrote a second ledger row');
  }

  // ── R10. THE FILE RE-APPLIES BYTE-IDENTICALLY ───────────────────────────
  {
    const bodies = async () => (await db.query(
      `select pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) as s,
              pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) as g`)).rows[0];
    const before = await bodies();
    let reapplied = true;
    try {
      const sql = (await readFile(new URL(`supabase/migrations/${MIG}`, ROOT), 'utf8')).replace(/\r\n/g, '\n');
      await db.exec(sql);
    } catch (e) { reapplied = false; ok(false, `the migration did not re-apply: ${e && e.message}`); }
    if (reapplied) {
      const after = await bodies();
      ok(after.s === before.s, 'a second apply leaves hr_state_of byte-identical');
      ok(after.g === before.g, 'a second apply leaves hr_rpc_gate byte-identical');
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  for (const [k, m] of Object.entries(MUTATIONS)) console.log(`${k}  [caught by ${m.by}]\n    ${m.why}\n`);
  console.log('negative control: comment-only edit (must NOT be caught)');
  process.exit(0);
}

const only = (argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
if (only) {
  if (!MUTATIONS[only]) { console.error(`unknown mutation "${only}" — see --list`); process.exit(2); }
  const gateBlind = argv.includes('--gate-blind');
  try { const db = await boot(only, gateBlind); await runAll(db); }
  catch (e) { console.log(`${only}: RED (threw: ${String(e.message).split('\n')[0]})`); process.exit(0); }
  console.log(`${only}${gateBlind ? ' [gate-blind]' : ''}: ${failed ? `RED (${failed} assertion(s))` : 'GREEN'}`);
  process.exit(0);
}

if (argv.includes('--selftest')) {
  console.log('recipe-learn --selftest: each mutation must turn the guard RED');
  {
    const save = failed; failed = 0;
    const db = await boot(null); await runAll(db);
    if (failed) { console.error(`\nFLOOR CHECK FAILED: the CLEAN pass is already red (${failed}).`); process.exit(2); }
    failed = save;
  }
  let bad = 0, n = 0;
  for (const name of Object.keys(MUTATIONS)) {
    for (const gateBlind of [false, true]) {
      n++;
      const label = gateBlind ? `${name} [gate-blind]` : name;
      const saveFail = failed; failed = 0; let threw = false;
      try { const db = await boot(name, gateBlind); await runAll(db); }
      catch (e) { threw = true; console.log(`  ${label}: RED (threw: ${String(e.message).split('\n')[0]})`); }
      const wentRed = failed > 0 || threw; failed = saveFail;
      if (gateBlind && threw) {
        bad++;
        console.error(`  x ${label}: the §5 short-circuit did NOT take (the apply still threw), so this arm `
          + "demonstrated the MIGRATION's gate again rather than the guard. Fix GATE_BLIND.");
        continue;
      }
      if (wentRed) { if (!threw) console.log(`  ${label}: RED (assertions failed) — caught by ${MUTATIONS[name].by}`); }
      else { bad++; console.error(`  x ${label}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
    }
  }
  {
    n++;
    const saveFail = failed; failed = 0; let threw = false;
    try { const db = await boot(null, false, NEGATIVE_CONTROL); await runAll(db); }
    catch (e) { threw = true; console.error(`  x negative control THREW: ${e && e.message}`); }
    const wentRed = failed > 0 || threw; failed = saveFail;
    if (wentRed) { bad++; console.error('  x negative control: a COMMENT-ONLY edit turned the guard red — '
      + 'its assertions read text, not behaviour, and every tick above is worthless'); }
    else console.log('  negative control (comment-only): GREEN, as required');
  }
  if (bad) { console.error(`\n${bad} mutation arm(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${n} arms behaved (${Object.keys(MUTATIONS).length} defects x gate / gate-blind, `
    + 'plus one negative control). The guard is non-vacuous in its own right.');
  process.exit(0);
}

try {
  const db = await boot(null);
  await runAll(db);
} catch (e) {
  if (e && e.harness) { console.error(`recipe-learn HARNESS: ${e.message}`); process.exit(2); }
  throw e;
}
if (failed) { console.error(`\nrecipe-learn: ${failed} assertion(s) FAILED.`); process.exit(1); }
console.log('recipe-learn: the nine scrolls match src/data both ways, hr_state_of projects the learned set '
  + 'top-level, a fresh character is locked and the SHIPPED src/core/artisan.js gateOk agrees, an empty '
  + 'bag and a forged id learn nothing, an uncatalogued flag row is not a capability, one scroll of two is '
  + 'consumed exactly once, the envelope / the verdict / hr_perks_of all agree and gateOk opens off both, '
  + 'and a re-learn and a replay each eat nothing.');
process.exit(0);
