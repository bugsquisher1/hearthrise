#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gem-unlock-buy.mjs — A THEME IS SOMETHING THE SERVER SOLD YOU.
//
//   node tests/gem-unlock-buy.mjs             # the guard
//   node tests/gem-unlock-buy.mjs --list      # the mutation catalogue
//   node tests/gem-unlock-buy.mjs --mutate=X  # one arm
//   node tests/gem-unlock-buy.mjs --selftest  # every mutation must turn it RED
//
// Ships with: supabase/migrations/2026-09-14-gem-unlock-buy.sql
//             supabase/migrations/2026-09-14-gem-unlocks-catalogue.generated.sql
//
// ── THE BUG IT CLOSES ───────────────────────────────────────────────────────
// `ownedThemes` / `ownedCosmetics` are RESIDUE — a bag the client writes and
// hr_put_client_state stores verbatim. The server has never held a theme or a
// cosmetic for anybody, which is the half of the b371 gem dupe that made a free
// purchase STICK: gems are server-of-record and armed, so `G.gems -= price` is a
// prediction the next envelope retires, while the thing bought stayed in a store
// a cloud restore can rewind and a console can forge. src/legacy.js closed the
// exploit the only way a client can — by REFUSING the gesture — so nine gem
// sinks the shop still renders are dead buttons today.
//
// ── WHAT THIS GUARD DRIVES (no credentials, real PostgreSQL) ────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite, then a real character through the REAL verb:
//
//   src/data/shops.js  →  hr_gem_unlocks (generated)  →  hr_buy_gem_unlock
//     →  player_state.gems debited by EXACTLY the catalogue price
//       →  player_progress flag  →  hr_gem_unlocks_of  →  hr_state_of envelope
//
// ── WHY R1 IS FIRST ─────────────────────────────────────────────────────────
// Most assertions below are "nothing moved" checks, and all of them pass
// trivially if the catalogue is empty or every price is zero — the class of
// "fix" that looks green and deletes a shop. R1 therefore binds the generated
// catalogue to src/data/shops.js in BOTH directions and requires every price to
// be positive first; only then do the did-not-move checks mean anything.
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

const MIG = '2026-09-14-gem-unlock-buy.sql';
const CAT = '2026-09-14-gem-unlocks-catalogue.generated.sql';
/* WHERE THE CLIENT READS THE PROJECTION. Was src/legacy.js until 2026-09-14,
   when the client half of this migration extracted ownsGemUnlock into its own
   module with buyGemUnlock (§7: the purchase flow is not UI glue). The pin
   FOLLOWS THE CODE rather than being deleted — if it stops finding the reader,
   this guard goes red and somebody re-checks the wire shape on purpose, which is
   exactly what happened when the function moved. */
const CLIENT_READER = 'src/features/gem-unlocks.js';
const UID = '000000e1-0000-0000-0000-0000000000e1';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  x ${msg}`); } };

/* ── THE GATE-BLIND PAIR ───────────────────────────────────────────────────
   Every mutation is ALSO run with the migration's own §7 commit gate short-
   circuited. A tick that only means "the apply threw" proves the MIGRATION can
   fail, not that THIS GUARD can see anything — and §7 fires once, at apply time.
   The regression that actually brings the bug back is a LATER migration
   restating hr_state_of from a stale template, at which point §7 never runs
   again and this file is the only thing left standing. */
const GATE_BLIND = [
  `  raise notice 'gem-unlock-buy: the price comes only from hr_gem_unlocks`,
  `  return;
exception when others then
  raise notice 'Sec 7 SHORT-CIRCUITED FOR THE MUTATION PROOF: %', sqlerrm;
end $$;
do $$ begin
  raise notice 'gem-unlock-buy: the price comes only from hr_gem_unlocks`,
];

/* ── MUTATIONS ─────────────────────────────────────────────────────────────
   Each plants a REAL defect a future edit could reintroduce, into the REAL
   migration text, and must turn THIS guard red. `why` names the defect; `by`
   names the assertion that is supposed to catch it, so a mutation cannot pass
   for the wrong reason. `file` defaults to the buy migration. */
const MUTATIONS = {
  projection_key_renamed: {
    by: 'R2',
    why: 'THE SHIPPED BUG, restored under a new name: hr_state_of projects the owned set under a '
       + 'key src/legacy.js does not read, so ownership falls back to the residue bag a cloud '
       + 'restore can rewind',
    find: `    'gem_unlocks', public.hr_gem_unlocks_of(p_user, v_st.slot),$new$);`,
    repl: `    'gemUnlocks', public.hr_gem_unlocks_of(p_user, v_st.slot),$new$);`,
  },
  read_narrowed_to_one_slot: {
    by: 'R12',
    why: 'the account-wide read is "tightened" back to the calling slot, which re-opens the double '
       + 'charge the 2026-09-14 game-designer ruling exists to prevent: Hero 2 cannot see the '
       + 'Phoenix Pet the account bought on Hero 1, so `already_owned` never fires and the player '
       + 'pays 1,200 gems of premium currency a second time for the same thing. The missing '
       + '`pp.slot` predicate is the FEATURE, and this arm is what says so to the next author',
    find: `      join public.player_progress pp
        on  pp.user_id = p_user
        and pp.kind = 'flag' and pp.period_key = ''`,
    repl: `      join public.player_progress pp
        on  pp.user_id = p_user and pp.slot = coalesce(p_slot, 0)
        and pp.kind = 'flag' and pp.period_key = ''`,
  },
  free_rows_dropped_from_the_set: {
    by: 'R2',
    why: 'hr_gem_unlocks_of stops unioning the FREE rows, so a fresh character does not own '
       + 'theme:default — and the day the client reads ownership server-first, the STARTING theme '
       + 'becomes unequippable (setTheme gates on ownsGemUnlock). A projection causing the exact '
       + 'bug class it exists to kill, and it would look like a client bug',
    find: `    select g.unlock_id as id
      from public.hr_gem_unlocks g
     where g.free
    union`,
    repl: `    select g.unlock_id as id
      from public.hr_gem_unlocks g
     where g.free and false
    union`,
  },
  free_row_becomes_sellable: {
    by: 'R4',
    why: 'the not_for_sale refusal is removed, so `theme:default` (cost 0) becomes a purchase — a '
       + 'zero-priced offer is an infinite faucet, and the "already owned" check is all that would '
       + 'stand between a player and an unbounded stream of free ledger rows',
    find: `  if v_cat.free then`,
    repl: `  if v_cat.free and false then`,
  },
  debit_is_not_the_catalogue_price: {
    by: 'R3',
    why: 'the debit charges a constant instead of the row it just read — the catalogue becomes '
       + 'decoration and the shop card and the wallet disagree, which is the money form of '
       + 'CLAUDE.md §6',
    find: `     set gems = gems - v_cat.cost_gems, version = version + 1, updated_at = now()`,
    repl: `     set gems = gems - 1, version = version + 1, updated_at = now()`,
  },
  already_owned_check_removed: {
    by: 'R6',
    why: 'buying something you already own charges you again — buyTheme\'s OWN historical bug '
       + '(the debit ran unconditionally and only a button label stood between a player and a '
       + 'second 1,000-gem Volcanic Keep), moved server-side',
    find: `  if v_owned @> to_jsonb(v_cat.unlock_id) then`,
    repl: `  if v_owned @> to_jsonb(v_cat.unlock_id) and false then`,
  },
  idempotency_replay_skipped: {
    by: 'R6',
    why: 'the replay cache is not consulted, so a retried gesture (a flaky network, a double tap) '
       + 'debits a second time for one purchase',
    find: `  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;`,
    repl: `  if v_cached is not null and false then
    return v_cached || jsonb_build_object('replayed', true);
  end if;`,
  },
  balance_check_removed: {
    by: 'R5',
    why: 'the affordability check is dead, so a player with 0 gems buys a 1,200-gem cosmetic and '
       + 'goes NEGATIVE — the balance becomes a number that can be spent past',
    find: `  if v_have < v_cat.cost_gems then`,
    repl: `  if v_have < v_cat.cost_gems and false then`,
  },
  rejection_seam_dropped: {
    by: 'R0',
    why: 'the wrapper stops decorating its refusals, so every refused purchase is invisible in '
       + 'hr_rejections and vitals.mjs reads zero for a surface that is failing '
       + '(tests/rejections-journal.mjs P6 sweeps chain end for exactly this)',
    find: `  return public.hr_note_rejection('hr_buy_gem_unlock', p_slot,
           public.hr_buy_gem_unlock__ungated($1, $2, $3));`,
    repl: `  return public.hr_buy_gem_unlock__ungated($1, $2, $3);`,
  },
  ungated_verb_granted_to_clients: {
    by: 'R0',
    why: 'the UNGATED twin is left executable by authenticated, so the rate gate is one POST away '
       + 'from being bypassed entirely — the whole point of the wrapper',
    find: `revoke execute on function public.hr_buy_gem_unlock__ungated(text, int, uuid)
  from anon, authenticated, service_role;`,
    repl: `grant execute on function public.hr_buy_gem_unlock__ungated(text, int, uuid)
  to authenticated;`,
  },
  catalogue_price_edited_by_hand: {
    by: 'R1',
    file: CAT,
    why: 'somebody reprices Forest Lodge in the GENERATED SQL instead of in src/data/shops.js, so '
       + 'the shop card says 500 and the server takes 5 — the data double-copy this repo '
       + 'generates its catalogues to prevent',
    find: `  ('theme:forest','theme','theme.forest','Forest Lodge',500,false),`,
    repl: `  ('theme:forest','theme','theme.forest','Forest Lodge',5,false),`,
  },
};

/* The NEGATIVE CONTROL. A comment-only edit must leave the guard GREEN — if it
   does not, the assertions are reading text rather than behaviour and every tick
   above is worthless. */
const NEGATIVE_CONTROL = {
  find: `-- ── 1. player_ledger.kind must admit 'gem_unlock' — PROGRAMMATIC, ADDITIVE ─`,
  repl: `-- ── 1. player_ledger.kind must admit 'gem_unlock' (comment-only control) ───`,
};

async function boot(mutate, gateBlind, extra) {
  const byFile = new Map();
  const add = (file, pair) => {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(pair);
  };
  if (mutate) add(MUTATIONS[mutate].file || MIG, [MUTATIONS[mutate].find, MUTATIONS[mutate].repl]);
  if (extra) add(MIG, [extra.find, extra.repl]);
  if (gateBlind) add(MIG, GATE_BLIND);
  const { db } = byFile.size ? await bootReplay({ patches: byFile }) : await bootReplay();
  return db;
}

/** R2's client half, as a PURE function of the reader's source text so the
 *  selftest can plant a defect in memory rather than on disk. Returns the
 *  problems it found (empty = the pin holds).
 *
 *  WHAT IT IS DEFENDING. The projection is an array of `<namespace>:<id>`
 *  strings, and the client's only ownership test indexes that array. Index it by
 *  the bare id and every check answers false for every real projection — the
 *  House shows Buy on a theme the account paid gems for — while every assertion
 *  about the SERVER stays green, because nothing on the server changed. */
export function clientReaderPin(src) {
  const out = [];
  if (typeof src !== 'string' || !src) {
    out.push(`${CLIENT_READER} could not be read — the client half of this migration has moved or `
      + 'been deleted, and R2\'s wire-shape pin is now pinning nothing. Follow the code: point '
      + 'CLIENT_READER at wherever ownsGemUnlock lives now.');
    return out;
  }
  const body = /function ownsGemUnlock\s*\([^)]*\)\s*\{[\s\S]*?\n\}/.exec(src);
  if (!body) {
    out.push(`${CLIENT_READER} no longer defines ownsGemUnlock() — the one client read of `
      + 'hr_state_of\'s gem_unlocks. Re-point CLIENT_READER, do not delete this pin.');
    return out;
  }
  if (!/indexOf\(\s*kind\s*\+\s*':'\s*\+\s*id\s*\)\s*>=\s*0/.test(body[0])) {
    out.push(`${CLIENT_READER} ownsGemUnlock no longer indexes the server set as kind+':'+id — the `
      + 'shape R2 asserts. The projection is `<namespace>:<id>`; indexing it any other way makes '
      + 'every owned theme read as unowned while the server stays perfectly correct.');
  }
  return out;
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

async function runAll(db) {
  const q = (sql, p) => one(db, sql, p);

  // ── R1. THE CATALOGUE IS src/data/shops.js, IN BOTH DIRECTIONS ──────────
  // First, because every "nothing moved" assertion below is vacuous against an
  // empty or zero-priced catalogue.
  const { SHOP_OFFERS } = await import(new URL('src/data/shops.js', ROOT).href);
  const authored = new Map();
  for (const o of SHOP_OFFERS) {
    if (o.table !== 'theme' && o.table !== 'cosmetic') continue;
    const cost = Array.isArray(o.cost) ? o.cost : [];
    if (cost.length !== 1 || cost[0].kind !== 'currency') continue;
    if (cost[0].id !== 'gems' && Number(cost[0].amount) !== 0) continue;
    const grants = (Array.isArray(o.grant) ? o.grant : []).filter((g) => g.kind === 'unlock');
    if (grants.length !== 1) continue;
    authored.set(String(grants[0].id), { cost: Number(cost[0].amount), name: o.name, ns: o.table });
  }
  ok(authored.size > 0, 'src/data/shops.js authors at least one theme/cosmetic offer');
  const rows = (await db.query('select * from public.hr_gem_unlocks order by unlock_id')).rows;
  ok(rows.length === authored.size,
     `hr_gem_unlocks has ${rows.length} rows, src/data/shops.js authors ${authored.size}`);
  for (const r of rows) {
    const a = authored.get(r.unlock_id);
    if (!a) { ok(false, `hr_gem_unlocks sells "${r.unlock_id}", which src/data/shops.js does not author`); continue; }
    ok(Number(r.cost_gems) === a.cost,
       `${r.unlock_id} costs ${r.cost_gems} in SQL and ${a.cost} in src/data/shops.js`);
    ok(r.name === a.name, `${r.unlock_id} is named "${r.name}" in SQL and "${a.name}" in src/data`);
    ok(r.namespace === a.ns, `${r.unlock_id} is namespaced ${r.namespace} in SQL and ${a.ns} in src/data`);
    ok(r.free === (Number(r.cost_gems) === 0), `${r.unlock_id}: free must be exactly (cost = 0)`);
  }
  for (const id of authored.keys()) {
    ok(rows.some((r) => r.unlock_id === id), `src/data/shops.js authors "${id}" and hr_gem_unlocks omits it`);
  }
  const priced = rows.filter((r) => !r.free);
  ok(priced.length > 0, 'at least one PRICED offer exists — otherwise every debit check below is vacuous');
  ok(priced.every((r) => Number(r.cost_gems) > 0), 'every non-free offer costs more than zero');
  // Every priced row must have a flag-shaped storage row, or the grant lands nowhere.
  const orphan = (await db.query(`select g.unlock_id from public.hr_gem_unlocks g
      left join public.hr_unlocks u on u.unlock_id = g.unlock_id
     where u.unlock_id is null or u.progress_kind is distinct from 'flag'`)).rows;
  ok(orphan.length === 0,
     `gem unlocks with no flag-shaped hr_unlocks row: ${orphan.map((r) => r.unlock_id).join(', ')}`);

  // ── R0. NOTHING BECAME CLIENT-REACHABLE ─────────────────────────────────
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const sig of ['public.hr_buy_gem_unlock__ungated(text,int,uuid)',
                       'public.hr_gem_unlocks_of(uuid,int)',
                       'public.hr_state_of(uuid,int)']) {
      const r = await q('select has_function_privilege($1, $2, \'execute\') as p', [role, sig]);
      ok(r.p === false, `${sig} is NOT executable by ${role}`);
    }
  }
  ok((await q("select has_function_privilege('authenticated', 'public.hr_buy_gem_unlock(text,int,uuid)', 'execute') as p")).p === true,
     'hr_buy_gem_unlock IS executable by authenticated (otherwise the button is dead)');
  ok((await q("select has_function_privilege('anon', 'public.hr_buy_gem_unlock(text,int,uuid)', 'execute') as p")).p === false,
     'hr_buy_gem_unlock is NOT executable by anon');
  const tgrants = (await db.query(`select grantee, privilege_type from information_schema.role_table_grants
     where table_schema='public' and table_name='hr_gem_unlocks'
       and grantee in ('anon','authenticated','service_role','PUBLIC')`)).rows;
  ok(tgrants.length === 0,
     `hr_gem_unlocks is reachable by a browser role: ${tgrants.map((g) => `${g.grantee}:${g.privilege_type}`).join(', ')}`);
  // The P6 seam, asserted here as well as in the migration, because the
  // migration's gate fires once and this file runs on every push.
  const seam = await q(`select (select count(*) from regexp_matches(p.prosrc, 'hr_note_rejection\\(', 'g')) as n
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='hr_buy_gem_unlock'`);
  ok(Number(seam.n) === 1,
     `the wrapper carries ${seam && seam.n} hr_note_rejection calls (need exactly 1) — a refusal `
     + 'nothing records is a refusal nobody can see');

  // ── THE FIXTURE. Every number below is read back from the server. ────────
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${UID}', false)`);
  const created = (await q('select public.hr_create_character(0) as r')).r;
  ok(created && created.created === true, `the probe character was created (${JSON.stringify(created)})`);

  /* A RAISED SQL ERROR IS AN ANSWER, not a reason to abandon the run. A defect
     that makes the verb violate a table CHECK (the balance going negative is
     exactly that) would otherwise throw out of this guard and be reported as a
     harness failure — which is indistinguishable from "the guard cannot see it".
     Turned into a shaped refusal so the assertions below grade it. */
  const buy = async (id, idem) => {
    try {
      return (await q('select public.hr_buy_gem_unlock__ungated($1::text, 0, $2::uuid) as r',
        [id, idem])).r;
    } catch (e) { return { ok: false, error: 'RAISED', raised: String(e && e.message).split(String.fromCharCode(10))[0] }; }
  };
  const gems = async () => Number((await q(
    'select gems from public.player_state where user_id=$1 and slot=0', [UID])).gems);
  const owned = async () => {
    const e = (await q('select public.hr_state_of($1::uuid, 0) as e', [UID])).e || {};
    return Array.isArray(e.gem_unlocks) ? e.gem_unlocks : [];
  };
  const ledger = async () => (await db.query(
    "select meta from public.player_ledger where user_id=$1 and kind='gem_unlock' order by at, id", [UID])).rows;

  const target = priced.slice().sort((a, b) => Number(a.cost_gems) - Number(b.cost_gems))[0];
  const freeRow = rows.find((r) => r.free);
  ok(!!freeRow, 'the catalogue carries a FREE row (theme:default) — the starting theme');

  // ── R2. THE PROJECTION IS THE SERVER'S ANSWER, TOP-LEVEL ────────────────
  {
    const env = (await q('select public.hr_state_of($1::uuid, 0) as e', [UID])).e;
    ok(Object.prototype.hasOwnProperty.call(env, 'gem_unlocks'),
       'a fresh character\'s envelope CARRIES the gem_unlocks key');
    ok(Array.isArray(env.gem_unlocks), 'gem_unlocks is an ARRAY (the shape ownsGemUnlock indexes)');
    /* Read through a coalesce: a mutation that renames the key leaves this
       undefined, and an unguarded `.includes` would throw the whole run instead
       of failing the assertion that names the defect. */
    const set = Array.isArray(env.gem_unlocks) ? env.gem_unlocks : [];
    ok(freeRow ? set.includes(freeRow.unlock_id) : false,
       `a fresh character OWNS the free ${freeRow && freeRow.unlock_id} (got ${JSON.stringify(env.gem_unlocks)}) `
       + '— without it the starting theme is unequippable once ownership reads server-first');
    ok(!set.includes(target.unlock_id),
       `a fresh character does NOT own the priced ${target.unlock_id}`);
    const direct = (await q('select public.hr_gem_unlocks_of($1::uuid, 0) as s', [UID])).s;
    ok(JSON.stringify(direct) === JSON.stringify(env.gem_unlocks),
       'the envelope key IS hr_gem_unlocks_of\'s answer, not a second computation');
    ok(set.length > 0 && set.every((x) => /^(theme|cosmetic):/.test(x)),
       `every projected id is '<namespace>:<id>' — the shape src/legacy.js ownsGemUnlock tests with `
       + `srv.indexOf(kind+':'+id) (got ${JSON.stringify(env.gem_unlocks)})`);
  }
  /* THE CLIENT READER, PINNED BY TEXT rather than executed: the browser module
     cannot be loaded here (it publishes onto `window` at import). This is a PIN,
     not a behaviour proof, and it is labelled as one — if the expression moves,
     this goes red and somebody re-checks the wire shape on purpose.
     The pin is a PURE function of the source text so `--selftest` can mutate the
     text in memory and prove the pin still bites, with no file write to undo. */
  {
    let src = null;
    try { src = await readFile(new URL(CLIENT_READER, ROOT), 'utf8'); } catch (e) { src = null; }
    const problems = clientReaderPin(src);
    ok(problems.length === 0, problems[0]
       || `${CLIENT_READER} ownsGemUnlock still indexes the server set as kind+':'+id — the shape R2 asserts`);
  }
  /* AND THE MONOLITH MUST NOT KEEP A SECOND COPY. Ownership answered in two
     places is ownership answered differently in two places, and the one in
     legacy.js is the one a render reaches first. */
  {
    const legacy = await readFile(new URL('src/legacy.js', ROOT), 'utf8');
    ok(!/function\s+ownsGemUnlock\s*\(/.test(legacy),
       'src/legacy.js defines ownsGemUnlock again — the reader moved to ' + CLIENT_READER
       + ' and a second definition is two answers to "do you own this"');
  }

  // ── R4. A FREE ROW IS NOT FOR SALE ──────────────────────────────────────
  {
    const g0 = await gems();
    const r = await buy(freeRow.unlock_id, null);
    ok(r && r.error === 'not_for_sale',
       `buying the free row answered ${JSON.stringify(r)} — it must be not_for_sale, or a 0-gem `
       + 'purchase path exists');
    ok((await gems()) === g0, 'the refused free purchase moved no gems');
    ok((await ledger()).length === 0, 'the refused free purchase journalled nothing');
  }

  // ── R5. NO GEMS, NO PURCHASE ────────────────────────────────────────────
  {
    const g0 = await gems();
    ok(g0 < Number(target.cost_gems),
       `a fresh character has ${g0} gems, below the cheapest offer (${target.cost_gems}) — otherwise `
       + 'this probe proves nothing');
    const r = await buy(target.unlock_id, null);
    ok(r && r.error === 'insufficient_gems',
       `a broke character was answered ${JSON.stringify(r)} — it must be insufficient_gems`);
    ok((await gems()) >= 0, 'the balance did not go NEGATIVE');
    ok((await gems()) === g0, 'the refused purchase moved no gems');
    ok(!(await owned()).includes(target.unlock_id), 'the refused purchase granted nothing');
  }

  // ── R7. A FORGED ID BUYS NOTHING ────────────────────────────────────────
  {
    const g0 = await gems();
    const r = await buy('theme:free_money', null);
    ok(r && r.error === 'unknown_unlock', `an uncatalogued id answered ${JSON.stringify(r)}`);
    ok((await gems()) === g0, 'an uncatalogued id moved no gems');
    ok((await ledger()).length === 0, 'an uncatalogued id journalled nothing');
  }

  // ── R3. THE HAPPY PATH — the debit is EXACTLY the catalogue price ───────
  const IDEM = '000000e1-0000-0000-0000-0000000000a1';
  await db.exec(`update public.player_state set gems = ${Number(target.cost_gems) + 7}
                  where user_id = '${UID}' and slot = 0;`);
  {
    const r = await buy(target.unlock_id, IDEM);
    ok(r && r.ok === true, `a funded purchase of ${target.unlock_id} was refused: ${JSON.stringify(r)}`);
    ok((await gems()) === 7,
       `the debit left ${await gems()} gems, expected 7 (cost ${target.cost_gems}) — the price `
       + 'charged is not the catalogue price');
    ok(Number(r.cost) === Number(target.cost_gems), 'the verdict quotes the catalogue price');
    ok(Array.isArray(r.gem_unlocks) && r.gem_unlocks.includes(target.unlock_id),
       'the verdict carries the thing just bought');
    const flag = await q(`select value from public.player_progress
       where user_id=$1 and slot=0 and kind='flag' and key=$2 and period_key=''`, [UID, target.unlock_id]);
    ok(flag && Number(flag.value) > 0, 'a kind=flag row was written on the calling character');
    // THE ENVELOPE AND THE VERDICT MUST AGREE (the renown-projection R3 rule).
    ok(JSON.stringify(await owned()) === JSON.stringify(r.gem_unlocks),
       'hr_state_of and the purchase verdict agree about the owned set');
  }

  // ── R8. ONE JOURNAL ROW, CARRYING THE SIGNED MOVEMENT ───────────────────
  {
    const l = await ledger();
    ok(l.length === 1, `${l.length} ledger rows for one purchase (need exactly 1 — a row per render `
       + 'is the game_events mistake at ledger scale)');
    ok(l[0] && Number(l[0].meta.gems) === -Number(target.cost_gems),
       `the journal records the signed movement (${l[0] && l[0].meta.gems} vs ${-target.cost_gems})`);
    ok(l[0] && l[0].meta.offer_id === target.offer_id,
       'the journal names the OFFER, so a ledger row traces back to the card the player tapped');
  }

  // ── R6. THE REPLAY CHARGES NOTHING, AND NEITHER DOES A RE-BUY ───────────
  {
    const g0 = await gems();
    const again = await buy(target.unlock_id, IDEM);
    ok(again && again.replayed === true,
       `the replayed key was not answered from the cache: ${JSON.stringify(again)}`);
    ok((await gems()) === g0, 'the replay MOVED GEMS — a retry charges twice');
    ok((await ledger()).length === 1, 'the replay wrote a second ledger row');

    const fresh = await buy(target.unlock_id, null);
    ok(fresh && fresh.error === 'already_owned',
       `re-buying an owned unlock with a FRESH key answered ${JSON.stringify(fresh)}`);
    ok((await gems()) === g0, 're-buying an owned unlock CHARGED AGAIN');
    ok((await ledger()).length === 1, 're-buying an owned unlock journalled a second row');
  }

  // ── R12. OWNERSHIP IS PER ACCOUNT (game-designer ruling, 2026-09-14) ────
  // A SECOND character of the same account must SEE what Hero 1 bought and must
  // be REFUSED a second purchase of it. Without the widened read this is a
  // silent double charge on the PREMIUM currency for every multi-character
  // player — and it is silent because each hero's own screen looks correct.
  //
  // The hero slot is granted through the REAL account entitlement flag rather
  // than by forging a player_state row, so hr_create_character's own ownership
  // gate (2026-09-08-hero-slot-buy.sql §8) is exercised rather than bypassed —
  // a probe that fabricates the character would also pass against a database
  // where the slot could not legitimately exist.
  {
    await db.exec(`insert into public.player_progress
                     (user_id, slot, kind, key, value, period_key, updated_at)
                   values ('${UID}', 0, 'flag', 'character_slot:1', 1, '', now())
                   on conflict (user_id, slot, kind, key, period_key) do update set value = 1;`);
    const hero2 = (await q('select public.hr_create_character(1) as r')).r;
    ok(hero2 && hero2.created === true,
       `the second character was refused (${JSON.stringify(hero2)}) — the account entitlement flag `
       + 'did not take, and R12 would otherwise pass by never running');

    const set1 = (await q('select public.hr_gem_unlocks_of($1::uuid, 1) as s', [UID])).s;
    ok(Array.isArray(set1) && set1.includes(target.unlock_id),
       `hero 2 does not own the ${target.unlock_id} hero 1 bought (${JSON.stringify(set1)}) — `
       + 'ownership is per ACCOUNT and this read is slot-scoped');
    const env1 = (await q('select public.hr_state_of($1::uuid, 1) as e', [UID])).e || {};
    ok(Array.isArray(env1.gem_unlocks) && env1.gem_unlocks.includes(target.unlock_id),
       `hero 2's ENVELOPE does not carry the account's unlock (${JSON.stringify(env1.gem_unlocks)})`);

    // Funded deliberately far above the price: a refusal that is really
    // `insufficient_gems` wearing another name would prove nothing.
    await db.exec(`update public.player_state set gems = 999999
                    where user_id = '${UID}' and slot = 1;`);
    const r2 = (await q(
      'select public.hr_buy_gem_unlock__ungated($1::text, 1, $2::uuid) as r',
      [target.unlock_id, null])).r;
    ok(r2 && r2.error === 'already_owned',
       `hero 2 buying the account's own ${target.unlock_id} answered ${JSON.stringify(r2)} — it must `
       + 'be already_owned, or the premium price is charged once per character');
    const gems1 = Number((await q(
      'select gems from public.player_state where user_id=$1 and slot=1', [UID])).gems);
    ok(gems1 === 999999, `hero 2 WAS CHARGED for an unlock the account already owns (${gems1})`);

    // AND THE WRITE STAYED WHERE THE MONEY CAME FROM. The ruling is a read/write
    // SPLIT: an account-wide read implemented as a per-slot write would duplicate
    // the flag and make the journal lie about which wallet paid.
    const flags = (await db.query(
      "select slot from public.player_progress where user_id=$1 and kind='flag' and key=$2",
      [UID, target.unlock_id])).rows;
    ok(flags.length === 1,
       `${flags.length} flag rows for one purchase — the account-wide READ was implemented as a `
       + 'per-slot WRITE');
    ok(flags[0] && Number(flags[0].slot) === 0, 'the flag is not on the PURCHASING slot');
    ok((await ledger()).length === 1, 'hero 2\'s refused purchase journalled a row');
  }

  // ── R9. THE FILE RE-APPLIES BYTE-IDENTICALLY ────────────────────────────
  // A migration the Coordinator can only run once cannot be replayed into a
  // restored database. Both splices must detect their own work and return.
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
  console.log('gem-unlock-buy --selftest: each mutation must turn the guard RED');
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
        console.error(`  x ${label}: the §7 short-circuit did NOT take (the apply still threw), so this arm `
          + "demonstrated the MIGRATION's gate again rather than the guard. Fix GATE_BLIND.");
        continue;
      }
      if (wentRed) { if (!threw) console.log(`  ${label}: RED (assertions failed) — caught by ${MUTATIONS[name].by}`); }
      else { bad++; console.error(`  x ${label}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
    }
  }
  /* THE CLIENT-READER ARMS. Planted in MEMORY, against the pure pin, because the
     defect lives in a browser module rather than in the migration text bootReplay
     patches — and because a mutation that writes to src/ is a mutation that can
     fail to restore itself. Two shapes, both of which have really happened:
     the expression re-indexed by the bare id, and the whole reader MOVING (which
     is what turned this guard red on 2026-09-14 and is why the pin now says
     "follow the code" instead of naming legacy.js). */
  {
    const src = await readFile(new URL(CLIENT_READER, ROOT), 'utf8');
    const arms = [
      ['client_reader_indexes_by_id_only',
       src.replace("srv.indexOf(kind + ':' + id) >= 0", 'srv.indexOf(id) >= 0'),
       'the client indexes the projected set by the bare id, so every owned theme reads as UNOWNED '
       + 'while every server-side assertion stays green'],
      ['client_reader_vanished', '// the reader was moved and the pin was not followed\n',
       'the reader is gone from the file this guard pins, which is how a text pin silently stops '
       + 'pinning anything'],
    ];
    for (const [label, mutated, why] of arms) {
      n++;
      if (mutated === src) { bad++; console.error(`  x ${label}: the anchor did not match — the arm planted NOTHING`); continue; }
      if (clientReaderPin(mutated).length === 0) { bad++; console.error(`  x ${label}: STAYED GREEN — the guard does not catch: ${why}`); }
      else console.log(`  ${label}: RED (assertions failed) — caught by R2`);
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
  if (e && e.harness) { console.error(`gem-unlock-buy HARNESS: ${e.message}`); process.exit(2); }
  throw e;
}
if (failed) { console.error(`\ngem-unlock-buy: ${failed} assertion(s) FAILED.`); process.exit(1); }
console.log('gem-unlock-buy: the catalogue IS src/data/shops.js in both directions, hr_state_of projects '
  + 'the owned set top-level, the free theme is owned by everybody and sellable to nobody, a broke '
  + 'character is refused, a funded one pays exactly the catalogue price once and is journalled once, '
  + 'a replay and a re-buy both charge nothing, a forged id buys nothing, a SECOND character of the '
  + 'account sees the unlock and is refused a second purchase of it while the flag stays on the '
  + 'purchasing slot, and nothing became client-executable.');
process.exit(0);
