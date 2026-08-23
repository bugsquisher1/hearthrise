#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/trait-buy.mjs — THE PERMANENT-TRAIT PURCHASE, GRADED AGAINST REAL
//                       POSTGRESQL.
//
//   node tests/trait-buy.mjs             # the guard
//   node tests/trait-buy.mjs --list      # the mutation catalogue
//   node tests/trait-buy.mjs --selftest  # every mutation must be CAUGHT
//   node tests/trait-buy.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-08-23-trait-buy.sql
//             src/net/gold.js buyTrait() · src/legacy.js buyTrait()
//
// ── THE DEFECT THIS EXISTS FOR (P0, live) ───────────────────────────────
// Under the LIVE marks arm, src/legacy.js buyTrait() fail-closes on its first
// line — `clientMayWriteRecordField('marks')` is false, because a raw
// `G.marks -= cost` on a server-owned balance is a client-authored debit the
// next envelope reconciles away while the trait stays granted. Correct, and it
// meant AUTO-EAT — the purchase the death sheet teaches on a player's first
// death — could not be bought at all in production. hr_trait_buy is the missing
// verb; this is the thing that proves it takes the money exactly once, grants
// exactly the row hr_auto_eat_tier reads, and never sells what it was not paid.
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite (real PostgreSQL, in process), then a real player through the REAL
// rate-gated RPC as `authenticated` with a JWT subject set. It also BINDS the
// two sides that must never disagree:
//   (A) src/legacy.js TRAITS  — what the player SEES and is charged on screen
//   (B) public.hr_traits      — what the server CHARGES
// A trait the server cannot sell, a trait the client cannot see, or a price that
// differs by one Mark fails the build BY NAME.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend, so the advisory lock and the
//     `for update` are asserted PRESENT and exercised serially. The
//     already_owned refusal and the idempotency cache are what make the race
//     safe and both are exercised as replays.
//   · The pooler, PostgREST and the JWT itself.
//   · Production's ACL — §8 of the migration asserts it at apply time.
//   · The CLIENT half (the transport + the arm gate) — that is
//     src/features/smoke-test.js's `b46x: buyTrait` battery.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bootReplay } from './schema-replay.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = '2026-08-23-trait-buy.sql';
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each is a defect somebody could plausibly write, and each must turn this
   guard RED. A guard that cannot demonstrate it sees failure is broken, not
   passing. */
const MUTATIONS = {
  no_ownership_check: {
    why: 'THE MONEY DEFECT: the already_owned refusal is deleted, so a second purchase of a trait '
       + 'the character already holds charges again — an unbounded Marks sink behind one button, '
       + 'and (worse) a re-buy that answers ok:true for a purchase that changed nothing',
    find: `  if coalesce(v_owned, 0) > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'trait_id', v_cat.trait_id);
  end if;`,
    repl: '  -- already_owned removed',
  },
  prereq_ignored: {
    why: 'the prerequisite stops being read, so Auto-Eat II — priced as an UPGRADE from I — is '
       + 'sold to a character who skipped I, handing out the entry tier for free',
    find: '  if v_cat.req_trait is not null then',
    repl: '  if false then',
  },
  marks_may_go_negative: {
    why: 'the affordability check is removed, so a character with 0 Marks buys the trait and the '
       + 'server-owned balance goes NEGATIVE — the exact client-authored debit this verb replaced',
    find: `    if v_have < v_cat.cost then
      perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'insufficient_marks',
        jsonb_build_object('trait', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have), 1);
      return jsonb_build_object('ok', false, 'error', 'insufficient_marks',
        'trait_id', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have);
    end if;`,
    repl: '    if false then raise exception \'unreachable\'; end if;',
  },
  idem_not_read: {
    why: 'the idempotency cache is never read, so a retry of one gesture (a dropped response, a '
       + 'double tap) debits a second time — the replay safety the whole intent key exists for',
    find: `  if p_idem is not null then
    select result into v_cached from public.player_intents
      where user_id = v_uid and intent_id = p_idem;
    if v_cached is not null then
      return v_cached || jsonb_build_object('replayed', true);
    end if;
  end if;`,
    repl: '  -- idempotency read removed',
  },
  refusals_cached: {
    why: 'a REFUSAL is cached under the idempotency key, so "you are 5 Marks short" becomes '
       + 'permanent for that key — the player earns the Marks and the same gesture still refuses',
    find: `      return jsonb_build_object('ok', false, 'error', 'insufficient_marks',
        'trait_id', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have);`,
    repl: `      if p_idem is not null then
        insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
          values (v_uid, p_idem, v_slot, 'trait_buy', jsonb_build_object('ok', false,
                  'error', 'insufficient_marks'), now())
          on conflict (user_id, intent_id) do nothing;
      end if;
      return jsonb_build_object('ok', false, 'error', 'insufficient_marks',
        'trait_id', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have);`,
  },
  no_grant_row: {
    why: 'the ownership flag row is never written, so the player pays and owns nothing — '
       + 'hr_auto_eat_tier still reads 0 and the trait is a pure Marks burn',
    find: `  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'flag', 'trait:' || v_cat.trait_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();`,
    repl: '  -- grant removed',
  },
  auto_eat_never_enabled: {
    why: 'buying Auto-Eat no longer switches it on, so the trait the death sheet teaches does '
       + 'nothing until the player finds a settings toggle they have never been shown',
    find: '      v_ae := public.hr_set_auto_eat(v_slot, true, null, null, false);',
    repl: '      v_ae := null;',
  },
  wrong_gate_bucket: {
    why: 'the rate-gate patch names a bucket the wrapper does not use. An UNKNOWN bucket fails '
       + 'CLOSED, so every purchase in the game answers 429 through a green deploy',
    find: "    'when ''hr_trait_buy'' then v_limit := 12;' || chr(10) ||",
    repl: "    'when ''hr_trait_buy_x'' then v_limit := 12;' || chr(10) ||",
  },
  no_arg_defaults: {
    why: 'the wrapper loses its argument defaults, so a client posting {p_trait_id, p_slot} gets '
       + 'PGRST202 — a 404 indistinguishable from "the migration was never applied" — and every '
       + 'Buy button stays dead through a green deploy',
    find: '  p_trait_id text, p_slot int default 0, p_idem uuid default null)',
    repl: '  p_trait_id text, p_slot int, p_idem uuid)',
  },
  envelope_drops_traits: {
    why: 'hr_state_of stops projecting the owned trait set, so a player who buys on one device '
       + 'cannot hydrate ownership on another and the save blob is the only home again',
    find: "  if strpos(v_def, $q$'traits', coalesce($q$) > 0 then\n    raise notice 'hr_state_of already projects traits — patch skipped'; return;\n  end if;",
    repl: "  if true then\n    raise notice 'hr_state_of traits projection skipped'; return;\n  end if;",
  },
};

const UUID = () => crypto.randomUUID();

/** One end-to-end run against a freshly replayed database. */
async function run(mutate) {
  const patches = mutate
    ? new Map([[MIG, [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]])
    : undefined;
  const { db } = await bootReplay({ patches, upTo: MIG });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* SESSION-SCOPED (`is_local = false`), not `set local`: PGlite runs each query
     in its own implicit transaction, so a transaction-local GUC is gone by the
     next statement and auth.uid() would read NULL. */
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: one real player, created the server's own way ────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'trait@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  await asUser(uid, 'select public.claim_display_name($1) as r', ['TraitProbe']);
  await gate();
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok(cr?.ok === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);

  const setMarks = (n) => q(
    'update public.player_state set marks = $2 where user_id = $1 and slot = 0', [uid, n]);
  const marksOf = async () => Number((await q(
    'select marks::text m from player_state where user_id=$1 and slot=0', [uid]))[0].m);
  const stateOf = async () => (await q(
    'select auto_eat_enabled e, auto_eat_pct::text p from player_state where user_id=$1 and slot=0',
    [uid]))[0];
  const tierOf = async () => Number((await q(
    'select public.hr_auto_eat_tier($1, 0)::text t', [uid]))[0].t);
  const flagRows = async () => (await q(
    "select key, value::text v from player_progress where user_id=$1 and slot=0 "
    + "and kind='flag' and key like 'trait:%' order by key", [uid]));

  const buy = async (trait, idem = null, slot = 0) => {
    await gate();
    return asUser(uid, 'select public.hr_trait_buy($1,$2,$3) as r', [trait, slot, idem]);
  };

  const obs = {};

  // ── C1. AN UNKNOWN TRAIT IS REFUSED, NOT SOLD ─────────────────────────
  await setMarks(20);
  obs.c1 = await buy('no_such_trait', UUID());
  obs.c1_marks = await marksOf();

  // ── C2. TIER II WITHOUT TIER I IS REFUSED BY NAME ─────────────────────
  obs.c2 = await buy('auto_eat_2', UUID());
  obs.c2_marks = await marksOf();

  // ── C3. SHORT OF MARKS: REFUSED, NOTHING MOVED, AND *NOT* CACHED ──────
  await setMarks(3);
  const shortIdem = UUID();
  obs.c3 = await buy('auto_eat', shortIdem);
  obs.c3_marks = await marksOf();
  obs.c3_cached = Number((await q(
    'select count(*)::text c from player_intents where user_id=$1 and intent_id=$2',
    [uid, shortIdem]))[0].c);

  // ── C4. THE PURCHASE: 15 MARKS OUT, THE FLAG ROW IN, AUTO-EAT ON ──────
  await setMarks(20);
  const idem = UUID();
  obs.c4 = await buy('auto_eat', idem);
  obs.c4_marks = await marksOf();
  obs.c4_tier = await tierOf();
  obs.c4_state = await stateOf();
  obs.c4_flags = await flagRows();

  // ── C5. A REPLAY ON THE SAME KEY RETURNS THE ORIGINAL, DEBITS NOTHING ─
  obs.c5 = await buy('auto_eat', idem);
  obs.c5_marks = await marksOf();

  // ── C6. A DIFFERENT KEY FOR AN OWNED TRAIT IS REFUSED, NOT RE-SOLD ────
  obs.c6 = await buy('auto_eat', UUID());
  obs.c6_marks = await marksOf();

  // ── C7. THE SHORT PURCHASE IS BUYABLE ONCE THE MARKS ARRIVE ───────────
  //        …with the SAME key that was refused. This is what "refusals are not
  //        cached" buys, and it is the difference between an honest refusal and
  //        a permanent one.
  await setMarks(100);
  obs.c7 = await buy('auto_eat_2', shortIdem);
  obs.c7_marks = await marksOf();
  obs.c7_tier = await tierOf();
  obs.c7_flags = await flagRows();

  // ── C8. ONE LEDGER ROW PER CREDITED PURCHASE, NEVER MORE ──────────────
  obs.ledger = (await q(
    "select intent, kind, gold::text gold, gold_in::text gold_in, meta from player_ledger "
    + "where user_id=$1 and kind='trait' order by intent", [uid]));

  // ── C9. THE ENVELOPE HYDRATES OWNERSHIP ───────────────────────────────
  await db.exec('set role hr_engine');
  try {
    obs.env = (await db.query('select public.hr_state_of($1, 0) as r', [uid])).rows[0]?.r;
  } finally { await db.exec('reset role').catch(() => {}); }

  // ── C10. THE TWO-ARGUMENT CALL FORM RESOLVES (PGRST202 insurance) ─────
  await gate();
  try {
    obs.c10 = await asUser(uid, 'select public.hr_trait_buy($1,$2) as r', ['no_such_trait', 0]);
    obs.c10_error = null;
  } catch (e) { obs.c10 = null; obs.c10_error = String(e.message || e).split('\n')[0]; }

  // ── C11. THE CATALOGUE, THE GATE AND THE GRANTS ───────────────────────
  obs.catalogue = await q('select trait_id, name, currency, cost::text cost, req_trait, '
    + 'auto_enable from public.hr_traits order by sort_ord, trait_id');
  obs.gateBuckets = (await q(
    "select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) as r"))[0].r;
  obs.acl = (await q(
    `select has_function_privilege('authenticated','public.hr_trait_buy(text,integer,uuid)','execute') wrapper,
            has_function_privilege('authenticated','public.hr_trait_buy__ungated(text,integer,uuid)','execute') inner_,
            has_function_privilege('anon','public.hr_trait_buy(text,integer,uuid)','execute') anon_,
            has_function_privilege('hr_engine','public.hr_trait_buy(text,integer,uuid)','execute') engine`))[0];
  obs.singleWriter = Number((await q(
    `select count(*)::text c from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       join pg_language  l on l.oid = p.prolang
      where n.nspname = 'public' and p.prokind = 'f'
        and l.lanname in ('sql','plpgsql')
        and p.proname <> 'hr_set_auto_eat'
        and pg_get_functiondef(p.oid) ~ 'set[[:space:]]+auto_eat_(pct|enabled)[[:space:]]*='`))[0].c);
  obs.ledgerKinds = (await q(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check'`))[0].d;

  await db.close?.();
  return obs;
}

/** Grade one run. Every assertion names the property, not the line. */
function grade(o) {
  ok(o.c1?.error === 'unknown_trait', `C1: an unknown trait was not refused: ${JSON.stringify(o.c1)}`);
  ok(o.c1_marks === 20, `C1: an unknown trait moved marks (${o.c1_marks}, expected 20)`);

  ok(o.c2?.error === 'requires:auto_eat',
    `C2: tier II was sold without its prerequisite: ${JSON.stringify(o.c2)}`);
  ok(o.c2_marks === 20, `C2: the refused upgrade moved marks (${o.c2_marks})`);

  ok(o.c3?.error === 'insufficient_marks' && Number(o.c3?.cost) === 15,
    `C3: a short purchase was not refused by name: ${JSON.stringify(o.c3)}`);
  ok(o.c3_marks === 3, `C3: the refused purchase moved marks (${o.c3_marks})`);
  ok(o.c3_cached === 0,
    'C3: a REFUSAL was cached under its idempotency key — the player could never buy it with that '
    + 'key once the marks arrived');

  ok(o.c4?.ok === true, `C4: the purchase did not go through: ${JSON.stringify(o.c4)}`);
  ok(o.c4_marks === 5, `C4: the purchase left ${o.c4_marks} marks, expected 20 - 15 = 5`);
  ok(Number(o.c4?.marks) === 5, `C4: the envelope reports ${o.c4?.marks} marks, expected 5`);
  ok(o.c4_tier === 1, `C4: hr_auto_eat_tier reports ${o.c4_tier} after buying Auto-Eat I, expected 1 `
    + '— the ownership row is not the one the tier reader reads');
  ok(o.c4_state?.e === true,
    'C4: buying Auto-Eat I did not switch auto-eat on — the trait the death sheet teaches does '
    + 'nothing until the player finds a settings toggle');
  ok(Number(o.c4_state?.p) === 25,
    `C4: the stored auto_eat_pct is ${o.c4_state?.p}, expected the tier-I ceiling of 25 — the `
    + 'enable did not go through hr_set_auto_eat, which is the only thing that clamps it');
  ok(o.c4_flags?.length === 1 && o.c4_flags[0].key === 'trait:auto_eat',
    `C4: the ownership rows are ${JSON.stringify(o.c4_flags)}`);
  ok(JSON.stringify(o.c4?.owned) === JSON.stringify(['auto_eat']),
    `C4: the envelope's owned set is ${JSON.stringify(o.c4?.owned)}`);

  ok(o.c5?.replayed === true && o.c5?.ok === true,
    `C5: the idempotent retry did not replay the original envelope: ${JSON.stringify(o.c5)}`);
  ok(o.c5_marks === 5, `C5: the replay RE-DEBITED (marks ${o.c5_marks}, expected 5)`);

  ok(o.c6?.error === 'already_owned', `C6: a re-buy was not refused: ${JSON.stringify(o.c6)}`);
  ok(o.c6_marks === 5, `C6: the refused re-buy moved marks (${o.c6_marks})`);

  ok(o.c7?.ok === true, `C7: the once-refused purchase did not go through after topping up: `
    + JSON.stringify(o.c7));
  ok(o.c7_marks === 0, `C7: tier II left ${o.c7_marks} marks, expected 100 - 100 = 0`);
  ok(o.c7_tier === 2, `C7: hr_auto_eat_tier reports ${o.c7_tier} after tier II, expected 2`);
  ok(o.c7_flags?.length === 2,
    `C7: the ownership rows after both purchases are ${JSON.stringify(o.c7_flags)}`);
  ok(JSON.stringify(o.c7?.owned) === JSON.stringify(['auto_eat', 'auto_eat_2']),
    `C7: the envelope's owned set is ${JSON.stringify(o.c7?.owned)}`);

  ok(o.ledger?.length === 2,
    `C8: expected 2 trait ledger rows (one per credited purchase), found ${o.ledger?.length}`);
  for (const r of o.ledger || []) {
    ok(Number(r.gold_in) === 0,
      `C8: '${r.intent}' journalled gold_in ${r.gold_in} — a trait purchase MINTS nothing and must `
      + 'not consume the accrual inflow budget');
    ok(Number(r.gold) === 0 && Number(r.meta?.marks) < 0,
      `C8: '${r.intent}' does not record the signed MARKS movement in meta: ${JSON.stringify(r.meta)}`);
  }
  ok(/'trait'/.test(o.ledgerKinds || ''),
    'C8: player_ledger_kind_check does not admit \'trait\' — the journal insert would 23514 and '
    + 'roll the whole purchase back');
  for (const k of ['accrue', 'bounty', 'shop', 'bank', 'worker', 'daily']) {
    ok(new RegExp(`'${k}'`).test(o.ledgerKinds || ''),
      `C8: the ledger-kind widen DELETED the '${k}' kind — it is not additive`);
  }

  ok(Array.isArray(o.env?.traits) && o.env.traits.length === 2,
    `C9: hr_state_of does not project the owned trait set (${JSON.stringify(o.env?.traits)}) — a `
    + 'player who buys on one device cannot hydrate ownership on another');
  ok(o.env?.state && o.env.state.marks !== undefined,
    'C9: the traits patch DROPPED a sibling projection from hr_state_of');

  ok(o.c10?.error === 'unknown_trait',
    `C10: the TWO-argument call form did not resolve (${o.c10_error || JSON.stringify(o.c10)}). `
    + 'PostgREST resolves an RPC by its NAMED ARGUMENTS; without defaults it answers PGRST202 and '
    + 'the whole feature deploys green and dead.');

  ok(/'hr_trait_buy'/.test(o.gateBuckets || ''),
    'C11: hr_rpc_gate does not admit hr_trait_buy — an unknown bucket fails CLOSED, so every '
    + 'purchase answers 429');
  for (const b of ['hr_bounty_spend', 'bank_move', 'client_state_put', 'farm_plant', 'clan_deposit']) {
    ok(new RegExp(`'${b}'`).test(o.gateBuckets || ''),
      `C11: the hr_rpc_gate patch DELETED the '${b}' bucket — the programmatic patch is not additive`);
  }
  ok(o.acl?.wrapper === true, 'C11: the wrapper is not callable by authenticated — the feature is dead');
  ok(o.acl?.inner_ === false, 'C11: the __ungated inner is client-executable — the rate gate is decoration');
  ok(o.acl?.anon_ === false, 'C11: hr_trait_buy is anon-executable');
  ok(o.acl?.engine === false,
    'C11: hr_engine can call hr_trait_buy — the accrual engine must never buy a paid trait for anybody');
  ok(o.singleWriter === 0,
    `C11: ${o.singleWriter} function(s) besides hr_set_auto_eat write an auto_eat column — that voids `
    + 'the tier write-clamp argument in 2026-08-29-auto-eat-tiers.sql');

  return new Map((o.catalogue || []).map((r) => [r.trait_id, r]));
}

/* ── (A)↔(B): the authored TRAITS ↔ the server catalogue, no database ──── */
async function bindGuard(cat) {
  const legacy = await readFile(join(ROOT, 'src', 'legacy.js'), 'utf8');

  /* Parsed out of legacy.js rather than duplicated: a second copy of game data
     is the failure this repo has been burned by (src/main.js unifyObject). */
  const at = legacy.indexOf('const TRAITS={');
  ok(at >= 0, 'BIND: `const TRAITS={` could not be located in legacy.js — the authored side is unreadable');
  if (at < 0) return;
  const open = legacy.indexOf('{', at);
  let depth = 0; let body = null;
  for (let i = open; i < legacy.length; i++) {
    if (legacy[i] === '{') depth++;
    else if (legacy[i] === '}' && --depth === 0) { body = legacy.slice(open, i + 1); break; }
  }
  ok(!!body, 'BIND: the TRAITS object literal is unbalanced — cannot read the authored prices');
  if (!body) return;

  /* Each row is `id:{ … }` with no nested braces. `req` is optional. */
  const rows = [...body.matchAll(/(^|[,{\s])([a-z0-9_]+)\s*:\s*\{([^{}]*)\}/g)].map((m) => {
    const b = m[3];
    const s = (k) => (b.match(new RegExp(`${k}\\s*:\\s*'([^']*)'`)) || [])[1] ?? null;
    const n = (k) => {
      const v = (b.match(new RegExp(`${k}\\s*:\\s*(-?\\d+)`)) || [])[1];
      return v === undefined ? null : Number(v);
    };
    return { id: m[2], name: s('name'), cost: n('cost'), currency: s('currency'), req: s('req') };
  });
  ok(rows.length >= 2, `BIND: TRAITS yielded ${rows.length} rows, expected at least 2 `
    + '(auto_eat, auto_eat_2)');

  for (const r of rows) {
    const c = cat.get(r.id);
    ok(!!c, `BIND: authored trait '${r.id}' is ABSENT from public.hr_traits, so its Buy button is `
      + 'DEAD under the marks arm — the exact defect this migration exists for');
    if (!c) continue;
    ok(Number(c.cost) === r.cost,
      `BIND: '${r.id}' costs ${r.cost} in legacy.js but ${c.cost} in hr_traits — the shop would `
      + 'advertise one price and the server would charge another');
    ok(c.currency === r.currency,
      `BIND: '${r.id}' is priced in '${r.currency}' on screen and '${c.currency}' on the server`);
    ok((c.req_trait || null) === (r.req || null),
      `BIND: '${r.id}' requires '${r.req || 'nothing'}' on screen and '${c.req_trait || 'nothing'}' `
      + 'on the server — one of the two ladders is not a ladder');
    ok(c.name === r.name,
      `BIND: '${r.id}' is named '${r.name}' on screen and '${c.name}' in the receipt`);
  }
  for (const id of cat.keys()) {
    ok(rows.some((r) => r.id === id),
      `BIND: hr_traits carries '${id}', which legacy.js TRAITS does not offer — the server would `
      + 'sell a trait the player can never see');
  }

  /* auto_enable is a BEHAVIOURAL claim about the client's own rule, so it is
     bound to that rule rather than asserted: legacy.js enables auto-eat for the
     `auto_eat` id and no other. */
  const enables = [...cat.values()].filter((c) => c.auto_enable === true).map((c) => c.trait_id);
  ok(JSON.stringify(enables) === JSON.stringify(['auto_eat']),
    `BIND: hr_traits auto-enables ${JSON.stringify(enables)}; legacy.js buyTrait enables exactly `
    + "['auto_eat'] (`if(id==='auto_eat')`). A disagreement means the two halves of one purchase "
    + 'leave the player in different states.');
  ok(/id===['"]auto_eat['"]/.test(legacy),
    'BIND: legacy.js buyTrait no longer special-cases auto_eat — re-derive hr_traits.auto_enable');

  /* The client transport must exist and must send NO price. Read the REQUEST
     BUILDER's own body rather than the whole file — the file's header names the
     forbidden fields in prose, and a scan that cannot tell a warning from a bug
     is a scan somebody deletes. */
  const goldJs = await readFile(join(ROOT, 'src', 'net', 'gold.js'), 'utf8');
  ok(/export\s+(?:async\s+)?function\s+buyTrait\s*\(/.test(goldJs),
    'BIND: src/net/gold.js has no buyTrait transport — legacy.js buyTrait() would still fail closed '
    + 'under the marks arm and every trait in the game would stay unbuyable');
  ok(/hr_trait_buy/.test(goldJs), 'BIND: the client transport does not name hr_trait_buy');
  const bAt = goldJs.indexOf('export function buildTraitBuyRequest(');
  ok(bAt >= 0, 'BIND: src/net/gold.js has no buildTraitBuyRequest — the wire bytes are unreadable, '
    + 'so nothing can assert what crosses');
  if (bAt >= 0) {
    const bEnd = goldJs.indexOf('\n}', bAt);
    const fn = goldJs.slice(bAt, bEnd < 0 ? goldJs.length : bEnd);
    ok(!/p_cost|p_price|p_currency|p_marks|p_gold/.test(fn),
      'BIND: buildTraitBuyRequest puts a PRICE, a CURRENCY or a BALANCE on the wire. It may send a '
      + 'trait id, a slot and an idempotency key and NOTHING else — the server owns every number '
      + `in this transaction. Body builder:\n${fn}`);
    for (const f of ['p_trait_id', 'p_slot', 'p_idem']) {
      ok(fn.includes(f), `BIND: buildTraitBuyRequest does not send ${f} — PostgREST resolves an RPC `
        + 'by its named arguments, so a missing one is PGRST202 and a dead button');
    }
  }
}

/**
 * The guard, as a function, so tests/run-smoke.mjs can call it the way it calls
 * modalGoalClaimGuard(). Returns the problem list; empty is green.
 */
export async function traitBuyGuard() {
  problems.length = 0;
  const catalogue = grade(await run());
  await bindGuard(catalogue);
  return [...problems];
}

// ── main (only when run directly; run-smoke imports the guard above) ─────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/trait-buy.mjs');
if (RUN_DIRECTLY) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.why}`);
    process.exit(0);
  }

  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  const selftest = argv.includes('--selftest');

  if (selftest) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught = false;
      try {
        const cat = grade(await run(id));
        await bindGuard(cat);
        caught = problems.length > 0;
      } catch (e) {
        caught = true;   // a mutation that makes the run throw is also caught
      }
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }

  const cat = grade(await run(mutateArg ? mutateArg.split('=')[1] : undefined));
  await bindGuard(cat);

  if (problems.length) {
    console.error(`trait-buy: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('trait-buy: green — server-priced, prerequisite-gated, debited once, idempotent on '
    + 'replay, already_owned refused, refusals not cached, auto-eat enabled through its single '
    + 'writer, ownership projected on the envelope, catalogue bound to legacy.js TRAITS.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
