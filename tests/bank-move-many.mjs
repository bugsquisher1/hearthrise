#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bank-move-many.mjs — MANY STACKS IN ONE CALL IS N SINGLE CALLS, ALL OR NOTHING
// (lane/c-bank-move-many; the UX flow audit 2026-11-11 build lane 2).
//
//   node tests/bank-move-many.mjs             the guard
//   node tests/bank-move-many.mjs --list      the mutation catalogue
//   node tests/bank-move-many.mjs --selftest  every mutation must be CAUGHT
//   node tests/bank-move-many.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2027-04-13-bank-move-many.sql (hr_bank_move_many, hr_item_lock_many,
// hr_bank_move_stack; hr_bank_move restated onto it).
//
// Real RPCs on a fully replayed PGlite chain (real PostgreSQL in process, production untouched). Two accounts with
// the same start kit: A moves through N single calls, B through ONE bulk call.
//   M1  PARITY, DEPOSIT. Storage, the bag and the journal (kind, intent, item, qty, meta, gold, slot) are byte-identical
//       after N hr_bank_move vs one hr_bank_move_many; the bulk wrote exactly N ledger rows and bumped the version ONCE.
//   M2  THE KEY. A replayed key returns the first answer and moves nothing; the key under another list is
//       intent_mismatch.
//   M3  PARITY, WITHDRAW. The same, the other way.
//   M4  A LOCKED STACK refuses the whole press: item_locked naming the stack and its index, nothing moved, no row, no
//       version, the key free.
//   M5  STORAGE FULL on the second new kind names it (bank_full {cap}) and the FIRST kind is unwound too.
//   M6  A HUNTING HERO is refused hunt_open {hunt}, nothing moved.
//   M7  BAD INPUT moves nothing and consumes no key: an empty list, a bare string, an item named twice, an unknown id
//       (named), a bad direction, a list past the cap (too_many_items).
//   M8  LOCK PARITY. Three single locks vs one hr_item_lock_many: identical rules rows; the replay returns the first
//       answer; the other direction under the key is a mismatch; the bulk unlock leaves what the singles leave;
//       an unknown id is named; an id twice is bad_items.
//   M9  ONE TOKEN. The bulk call of N stacks counted ONE `bank_move` token, the N singles counted N; a bulk lock ONE
//       `hunt` token.
//   M10 THE LOCK ORDER (what PGlite, one backend, cannot race): in hr_bank_move_many the hero lock (hr_hunt_lock) ->
//       its row -> the depot key -> the first stack; in hr_bank_move the row -> the depot key -> the stack. Both take
//       the character before the depot.
//   M11 THE ACL. The two verbs are authenticated-only; hr_bank_move_stack is reachable by nobody; both verbs are on
//       hr_client_rpc_baseline; both bodies name the rate gate (A9).
//   M12 RE-APPLY IS A NO-OP. The file applied a second time leaves the schema fingerprint, the baseline rows and
//       hr_bank_move's md5 identical.
// TRUE CONCURRENCY is unverified locally (PGlite is one backend); M10 pins the order that makes it correct.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2027-04-13-bank-move-many.sql';

/* The migration's own §0 and §6 short-circuited, so every catch below is the guard's, not the file's. */
const GATE_BLIND = [
  ['  v_md5 text;\nbegin\n  if to_regprocedure(c_sig) is null then',
   '  v_md5 text;\nbegin\n  if true then return; end if;   -- selftest: §0 short-circuited\n  if to_regprocedure(c_sig) is null then'],
  ['  s_a text; s_b text;\nbegin\n  begin\n',
   '  s_a text; s_b text;\nbegin\n  if true then return; end if;   -- selftest: §6 short-circuited\n  begin\n'],
];
const BODY = {
  lock_ignored: {
    why: 'a locked stack is deposited by the bulk verb: the lock no longer keeps it in the bag',
    find: '        if public.hr_item_locked(v_uid, p_slot, v_item) then\n          raise exception',
    repl: '        if false then\n          raise exception',
  },
  hunt_ignored: {
    why: 'a hero out hunting empties its bag into Storage from the field',
    find: "  if v_s.id is not null then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open'",
    repl: "  if false then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open'",
  },
  partial_kept: {
    why: 'a refused stack is skipped instead of unwinding the press: the earlier stacks stay moved and the answer is ok',
    find: '      if v_r is not null then\n        raise exception using errcode = \'HR881\', message = \'bank_move_many: refused\',\n          detail = (v_r || jsonb_build_object(\'item_id\', v_item, \'index\', v_n))::text; end if;',
    repl: '      if v_r is not null then\n        continue; end if;',
  },
  replay_off: {
    why: 'a replayed key runs the press again instead of returning the first answer',
    find: "  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection(c_verb, p_slot, v_cached); end if;\n  if v_cached is not null then return v_cached; end if;\n\n  -- ONE token",
    repl: "  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection(c_verb, p_slot, v_cached); end if;\n\n  -- ONE token",
  },
  ledger_dropped: {
    why: 'the per-stack body journals nothing: a move leaves no ledger row (the single verb drifts with it)',
    find: "  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)\n    values (p_user, p_slot, 'bank', 'bank_' || p_dir, p_item,",
    repl: "  perform (p_user, p_slot, 'bank', 'bank_' || p_dir, p_item,",
  },
  room_ignored: {
    why: 'the per-stack body no longer asks the Storage room: a new kind lands past the cap (single and bulk alike)',
    find: '    if not public.hr_storage_room_fits(p_user, p_item) then',
    repl: '    if false then',
  },
  version_unbumped: {
    why: 'the bulk press does not bump the version: the client never reconciles on it',
    find: "  v_new_version := v_state.version + 1;\n  update public.player_state set version = v_new_version, updated_at = now()\n    where user_id = v_uid and slot = p_slot;\n\n  v_cached := jsonb_build_object('ok', true, 'count', v_n, 'version', v_new_version);",
    repl: "  v_new_version := v_state.version + 1;\n\n  v_cached := jsonb_build_object('ok', true, 'count', v_n, 'version', v_new_version);",
  },
  dup_allowed: {
    why: 'an item named twice in one list is accepted: the second whole-stack move runs on an empty row',
    find: "     or (select count(distinct e ->> 'item') from jsonb_array_elements(p_items) e) <> jsonb_array_length(p_items) then",
    repl: '     or false then',
  },
  anon_granted: {
    why: 'anon may execute hr_bank_move_many',
    find: 'grant  execute on function public.hr_bank_move_many(integer, jsonb, uuid) to authenticated;',
    repl: 'grant  execute on function public.hr_bank_move_many(integer, jsonb, uuid) to authenticated, anon;',
  },
  stack_reachable: {
    why: 'authenticated may call the per-stack body directly, outside every lock and gate (a grant typed after the revoke)',
    find: 'revoke execute on function public.hr_bank_move_stack(uuid, integer, text, bigint, text, integer) from anon, authenticated, service_role, hr_engine;',
    repl: 'revoke execute on function public.hr_bank_move_stack(uuid, integer, text, bigint, text, integer) from anon, authenticated, service_role, hr_engine;\ngrant execute on function public.hr_bank_move_stack(uuid, integer, text, bigint, text, integer) to authenticated;',
  },
  lock_unknown_allowed: {
    why: 'hr_item_lock_many writes a rule for an id the catalogue does not know',
    find: "    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_item', 'item_id', v_item)); end if;\n  perform public.hr_hunt_lock(v_uid, p_slot);\n  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;\n  for v_item in",
    repl: "    null; end if;\n  perform public.hr_hunt_lock(v_uid, p_slot);\n  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;\n  for v_item in",
  },
  depot_unlocked: {
    why: 'the bulk verb no longer takes the account depot key: two heroes of one account move at once',
    find: "  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));\n\n  -- THE STACKS, in list order",
    repl: '\n  -- THE STACKS, in list order',
  },
};
const MUTATIONS = {};
for (const [id, m] of Object.entries(BODY)) MUTATIONS[id] = { ...m, also: GATE_BLIND };

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const patchList = (mutate) => {
  if (!mutate) return [];
  const m = MUTATIONS[mutate];
  if (!m) { const e = new Error(`unknown mutation: ${mutate}`); e.harness = true; throw e; }
  return [[m.find, m.repl], ...(m.also || [])];
};
const migrationText = async (mutate) => {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  for (const [find, repl] of patchList(mutate)) sql = sql.replace(find, () => repl);
  return sql;
};

async function run(mutate) {
  problems.length = 0;
  const { db } = await bootReplay({ patches: mutate ? new Map([[MIG, patchList(mutate)]]) : undefined, upTo: MIG });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const as = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const tokens = async (uid, bucket) => Number((await one('select coalesce(sum(n), 0)::text t from public.hr_rate_counters where user_id = $1 and bucket = $2', [uid, 'rpc:' + bucket])).t);
  const md5 = async (sig) => (await one("select md5(regexp_replace(pg_get_functiondef($1::regprocedure), '[[:space:]]+', ' ', 'g')) m", [sig])).m;
  /* the rows of one account, without ids, users or clocks */
  const bank = async (u) => JSON.stringify(await q('select item_id i, qty::text q from public.account_bank where user_id = $1 order by item_id', [u]));
  const bag = async (u) => JSON.stringify(await q('select item_id i, qty::text q from public.player_inventory where user_id = $1 and slot = 0 order by item_id', [u]));
  const ledger = async (u, since) => JSON.stringify(await q('select kind k, intent n, item_id i, qty::text q, meta m, gold::text g, slot s from public.player_ledger where user_id = $1 and id > $2 order by item_id, id', [u, since]));
  const rules = async (u) => JSON.stringify(await q('select item_id i, locked l, loot_rule r, restock s from public.player_item_rules where user_id = $1 and slot = 0 order by item_id', [u]));
  const ledgerMax = async (u) => (await one('select coalesce(max(id), 0)::text m from public.player_ledger where user_id = $1', [u])).m;
  const version = async (u) => (await one('select version::text v from public.player_state where user_id = $1 and slot = 0', [u])).v;
  const keyHeld = async (u, key) => (await one('select exists (select 1 from public.player_intents where user_id = $1 and intent_id = $2) e', [u, key])).e;
  const uuid = async () => (await one('select gen_random_uuid() as i')).i;
  const single = async (u, item, dir) => {
    await as(u);
    const have = dir === 'deposit'
      ? (await one('select qty::text n from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2', [u, item]))
      : (await one('select qty::text n from public.account_bank where user_id = $1 and item_id = $2', [u, item]));
    return (await one('select public.hr_bank_move(0, $1, $2::bigint, $3, $4) v', [item, have.n, dir, await uuid()])).v;
  };
  const many = async (u, list, key) => { await as(u); return (await one('select public.hr_bank_move_many(0, $1::jsonb, $2::uuid) v', [JSON.stringify(list), key || await uuid()])).v; };
  const lockOne = async (u, item, on) => { await as(u); return (await one('select public.hr_item_lock(0, $1, $2, $3) v', [item, on, await uuid()])).v; };
  const lockMany = async (u, list, on, key) => { await as(u); return (await one('select public.hr_item_lock_many(0, $1::jsonb, $2, $3::uuid) v', [JSON.stringify(list), on, key || await uuid()])).v; };

  // Two accounts with the same start kit.
  const A = await uuid(), B = await uuid();
  for (const u of [A, B]) {
    await q('insert into auth.users (id) values ($1)', [u]);
    await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'bank-move-many test')", [u]);
    await as(u);
    const v = (await one('select public.hr_create_character(0) v')).v;
    ok(v && v.ok === true, `setup: hr_create_character answered ${JSON.stringify(v)}`);
  }
  ok(await bag(A) === await bag(B), 'setup: the two probes do not start with the same bag');
  const kinds = (await q('select item_id from public.player_inventory where user_id = $1 and slot = 0 order by item_id', [A])).map((r) => r.item_id);
  const n = kinds.length;
  ok(n >= 3, `setup: fewer than three kit kinds (${n})`);
  const depList = kinds.map((item) => ({ item, dir: 'deposit' }));
  const wdList = kinds.map((item) => ({ item, dir: 'withdraw' }));

  // M1 PARITY, DEPOSIT.
  let la = await ledgerMax(A), lb = await ledgerMax(B);
  for (const item of kinds) { const v = await single(A, item, 'deposit'); ok(v && v.ok === true, `M1: a single deposit of ${item} answered ${JSON.stringify(v)}`); }
  const verB = Number(await version(B));
  const keyDep = await uuid();
  let v = await many(B, depList, keyDep);
  ok(v && v.ok === true && v.count === n && Number(v.version) === verB + 1, `M1: the bulk deposit answered ${JSON.stringify(v)} (wanted count ${n}, version ${verB + 1})`);
  ok(await bank(A) === await bank(B), `M1: Storage differs after N singles vs one bulk: ${await bank(A)} vs ${await bank(B)}`);
  ok(await bag(A) === await bag(B) && await bag(B) === '[]', `M1: the bags differ or are not empty: ${await bag(A)} vs ${await bag(B)}`);
  ok(await ledger(A, la) === await ledger(B, lb), `M1: the journal differs after N singles vs one bulk:\n    ${await ledger(A, la)}\n    ${await ledger(B, lb)}`);
  ok(Number((await one('select count(*)::text c from public.player_ledger where user_id = $1 and id > $2', [B, lb])).c) === n, `M1: the bulk did not write exactly ${n} ledger rows`);
  ok(Number(await version(B)) === verB + 1, `M1: the version moved ${Number(await version(B)) - verB} steps, not 1`);

  // M9 ONE TOKEN (read here, before more presses): N singles counted N, the bulk ONE.
  ok(await tokens(A, 'bank_move') === n && await tokens(B, 'bank_move') === 1, `M9: bank_move tokens A ${await tokens(A, 'bank_move')} (wanted ${n}), B ${await tokens(B, 'bank_move')} (wanted 1)`);

  // M2 THE KEY.
  const v2 = await many(B, depList, keyDep);
  ok(JSON.stringify(v2) === JSON.stringify(v), `M2: a replayed key answered ${JSON.stringify(v2)}, the first was ${JSON.stringify(v)}`);
  ok(Number((await one('select count(*)::text c from public.player_ledger where user_id = $1 and id > $2', [B, lb])).c) === n && Number(await version(B)) === verB + 1, 'M2: a replay moved something');
  const v3 = await many(B, wdList, keyDep);
  ok(v3 && v3.error === 'intent_mismatch', `M2: the key under another list answered ${JSON.stringify(v3)}`);
  ok(await bank(A) === await bank(B), 'M2: the mismatch moved something');

  // M3 PARITY, WITHDRAW.
  la = await ledgerMax(A); lb = await ledgerMax(B);
  for (const item of kinds) { const r = await single(A, item, 'withdraw'); ok(r && r.ok === true, `M3: a single withdraw of ${item} answered ${JSON.stringify(r)}`); }
  v = await many(B, wdList);
  ok(v && v.ok === true && v.count === n, `M3: the bulk withdraw answered ${JSON.stringify(v)}`);
  ok(await bank(A) === await bank(B) && await bank(B) === '[]', `M3: Storage differs or is not empty: ${await bank(A)} vs ${await bank(B)}`);
  ok(await bag(A) === await bag(B), `M3: the bags differ after N singles vs one bulk: ${await bag(A)} vs ${await bag(B)}`);
  ok(await ledger(A, la) === await ledger(B, lb), `M3: the journal differs after the withdraws:\n    ${await ledger(A, la)}\n    ${await ledger(B, lb)}`);

  // M4 A LOCKED STACK refuses the whole press.
  lb = await ledgerMax(B);
  const verLocked = await version(B);
  await lockOne(B, kinds[1], true);
  const keyLocked = await uuid();
  v = await many(B, depList, keyLocked);
  ok(v && v.error === 'item_locked' && v.item_id === kinds[1] && v.index === 1, `M4: a bulk deposit over a locked stack answered ${JSON.stringify(v)}`);
  ok(await bank(B) === '[]', `M4: the refused press moved a stack: ${await bank(B)}`);
  ok(await ledgerMax(B) === lb && await version(B) === verLocked && !(await keyHeld(B, keyLocked)), 'M4: the refused press wrote a row, bumped the version or kept the key');
  await lockOne(B, kinds[1], false);

  // M5 STORAGE FULL names the second kind and unwinds the first.
  await q('update public.hr_depot_config set base_stacks = 1 where only_row');
  v = await many(B, depList);
  ok(v && v.error === 'bank_full' && v.item_id === kinds[1] && v.index === 1 && v.cap === 1, `M5: a bulk deposit past the room answered ${JSON.stringify(v)}`);
  ok(await bank(B) === '[]', `M5: the first stack stayed in Storage after the refusal: ${await bank(B)}`);
  await q('update public.hr_depot_config set base_stacks = 1000 where only_row');

  // M6 A HUNTING HERO.
  const inst = await uuid();
  await q("insert into public.hunt_instances (id, hunt_id) values ($1, 'mill_cellar')", [inst]);
  await q("insert into public.hunt_sessions (user_id, slot, hunt_id, hunt_from, settled_to, next_swing_at, instance_id) values ($1, 0, 'mill_cellar', now(), now(), now(), $2)", [B, inst]);
  v = await many(B, depList);
  ok(v && v.error === 'hunt_open' && v.hunt === 'mill_cellar', `M6: a bulk deposit on a hunting hero answered ${JSON.stringify(v)}`);
  ok(await bank(B) === '[]', 'M6: a hunting hero moved a stack');
  await q('delete from public.hunt_sessions where user_id = $1 and instance_id = $2', [B, inst]);
  await q('delete from public.hunt_instances where id = $1', [inst]);

  // M7 BAD INPUT.
  const keyBad = await uuid();
  const bad = [
    [[], 'bad_items', 'an empty list'],
    [[kinds[0]], 'bad_items', 'a bare string'],
    [[{ item: kinds[0], dir: 'deposit' }, { item: kinds[0], dir: 'withdraw' }], 'bad_items', 'an item named twice'],
    [[{ item: kinds[0], dir: 'deposit' }, { item: 'no_such_item_zz', dir: 'deposit' }], 'unknown_item', 'an unknown id'],
    [[{ item: kinds[0], dir: 'sideways' }], 'bad_items', 'a bad direction'],
    [[{ item: kinds[0], dir: 'deposit', qty: 5 }], 'bad_items', 'a client count'],
    [Array.from({ length: 1001 }, (_, i) => ({ item: 'item_' + i, dir: 'deposit' })), 'too_many_items', 'a list past the cap'],
  ];
  for (const [list, code, what] of bad) {
    v = await many(B, list, keyBad);
    ok(v && v.error === code, `M7: ${what} answered ${JSON.stringify(v)} (wanted ${code})`);
    if (code === 'unknown_item') ok(v && v.item_id === 'no_such_item_zz', `M7: the unknown id was not named: ${JSON.stringify(v)}`);
  }
  ok(!(await keyHeld(B, keyBad)) && await bank(B) === '[]', 'M7: a refused press consumed its key or moved a stack');

  // M8 LOCK PARITY.
  const three = kinds.slice(0, 3);
  for (const item of three) { const r = await lockOne(A, item, true); ok(r && r.ok === true, `M8: a single lock answered ${JSON.stringify(r)}`); }
  const keyLock = await uuid();
  const huntTokens = await tokens(B, 'hunt');
  v = await lockMany(B, three, true, keyLock);
  ok(v && v.ok === true && v.count === 3 && v.bag_rules && v.bag_rules.locked.length === 3, `M8: the bulk lock answered ${JSON.stringify(v)}`);
  ok(await rules(A) === await rules(B), `M8: the rules differ after 3 singles vs one bulk: ${await rules(A)} vs ${await rules(B)}`);
  const r2 = await lockMany(B, three, true, keyLock);
  ok(JSON.stringify(r2) === JSON.stringify(v), `M8: a replayed bulk lock answered ${JSON.stringify(r2)}`);
  const r3 = await lockMany(B, three, false, keyLock);
  ok(r3 && r3.error === 'intent_mismatch', `M8: the key under the other direction answered ${JSON.stringify(r3)}`);
  ok(await tokens(B, 'hunt') === huntTokens + 1, `M9: a bulk lock of 3 + its replay + its mismatch counted ${await tokens(B, 'hunt') - huntTokens} hunt tokens, not 1 (a replay or a mismatch returns before the gate)`);
  v = await lockMany(B, three, false);
  ok(v && v.ok === true && v.count === 3, `M8: the bulk unlock answered ${JSON.stringify(v)}`);
  for (const item of three) await lockOne(A, item, false);
  ok(await rules(A) === await rules(B) && await rules(B) === '[]', `M8: the rules differ after the unlocks: ${await rules(A)} vs ${await rules(B)}`);
  v = await lockMany(B, [kinds[0], 'no_such_item_zz'], true);
  ok(v && v.error === 'unknown_item' && v.item_id === 'no_such_item_zz', `M8: an unknown id answered ${JSON.stringify(v)}`);
  v = await lockMany(B, [kinds[0], kinds[0]], true);
  ok(v && v.error === 'bad_items', `M8: an id named twice answered ${JSON.stringify(v)}`);
  ok(await rules(B) === '[]', 'M8: a refused bulk lock wrote a rule');

  // M10 THE LOCK ORDER.
  const srcMany = (await one("select prosrc from pg_proc where oid = to_regprocedure('public.hr_bank_move_many(integer,jsonb,uuid)')")).prosrc.replace(/--[^\n]*/g, '');
  const iHero = srcMany.indexOf('v_s := public.hr_hunt_lock(v_uid, p_slot);');
  const iRow = srcMany.indexOf('from public.player_state where user_id = v_uid and slot = p_slot for update');
  const iDepot = srcMany.indexOf("pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0))");
  const iStack = srcMany.indexOf('public.hr_bank_move_stack(');
  ok(iHero > 0 && iRow > iHero && iDepot > iRow && iStack > iDepot, `M10: bulk lock order hero ${iHero} -> row ${iRow} -> depot ${iDepot} -> stack ${iStack} (need increasing)`);
  const srcOne = (await one("select prosrc from pg_proc where oid = to_regprocedure('public.hr_bank_move(integer,text,bigint,text,uuid)')")).prosrc.replace(/--[^\n]*/g, '');
  const jRow = srcOne.indexOf('where user_id = v_uid and slot = p_slot for update');
  const jDepot = srcOne.indexOf("pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0))");
  const jStack = srcOne.indexOf('public.hr_bank_move_stack(');
  ok(jRow > 0 && jDepot > jRow && jStack > jDepot, `M10: single lock order row ${jRow} -> depot ${jDepot} -> stack ${jStack} (need increasing)`);
  ok(!/account_bank|player_inventory|player_ledger/.test(srcOne), 'M10: hr_bank_move still touches the rows itself (two copies of the per-stack rule)');

  // M11 THE ACL.
  const priv = async (role, sig) => (await one(`select has_function_privilege('${role}','public.${sig}','execute') e`)).e;
  for (const role of ['anon', 'authenticated', 'service_role']) ok(!(await priv(role, 'hr_bank_move_stack(uuid,integer,text,bigint,text,integer)')), `M11: ${role} reaches hr_bank_move_stack`);
  for (const sig of ['hr_bank_move_many(integer,jsonb,uuid)', 'hr_item_lock_many(integer,jsonb,boolean,uuid)']) {
    ok(await priv('authenticated', sig) && !(await priv('anon', sig)) && !(await priv('service_role', sig)), `M11: ${sig} is not authenticated-only`);
  }
  ok(Number((await one("select count(*)::text c from public.hr_client_rpc_baseline where grantee = 'authenticated' and (proname, identity_args) in (('hr_bank_move_many', 'p_slot integer, p_items jsonb, p_idem uuid'), ('hr_item_lock_many', 'p_slot integer, p_items jsonb, p_locked boolean, p_idem uuid'))")).c) === 2, 'M11: the two verbs are not on hr_client_rpc_baseline');
  ok(/hr_rpc_gate\('bank_move'\)/.test(srcMany), 'M11: hr_bank_move_many names no rate gate (A9)');
  ok(/hr_rpc_gate\('hunt'\)/.test((await one("select prosrc from pg_proc where oid = to_regprocedure('public.hr_item_lock_many(integer,jsonb,boolean,uuid)')")).prosrc), 'M11: hr_item_lock_many names no rate gate (A9)');

  // M12 RE-APPLY IS A NO-OP.
  await as('');
  const before = JSON.stringify(await inventory(db));
  const baseline = () => q('select proname, identity_args, grantee, note from public.hr_client_rpc_baseline order by 1, 2, 3');
  const baseRows = JSON.stringify(await baseline());
  const md5Before = await md5('public.hr_bank_move(integer,text,bigint,text,uuid)');
  await db.exec(await migrationText(mutate));
  ok(JSON.stringify(await inventory(db)) === before, 'M12: a second apply changed the schema fingerprint');
  ok(JSON.stringify(await baseline()) === baseRows, 'M12: a second apply changed the baseline rows');
  ok(await md5('public.hr_bank_move(integer,text,bigint,text,uuid)') === md5Before, 'M12: a second apply changed hr_bank_move');
  await db.close?.();
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) { for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}`); process.exit(0); }
  const only = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest') || only) {
    const ids = only ? [only.slice('--mutate='.length)] : Object.keys(MUTATIONS);
    let slipped = 0;
    for (const id of ids) {
      let caught;
      try { const p = await run(id); caught = p.length ? p[0] : null; }
      catch (e) { if (e.harness) throw e; caught = 'refused at apply: ' + String(e.message).split('\n')[0].slice(0, 160); }
      if (caught) console.log(`  CAUGHT  ${id}: ${caught}`);
      else { slipped++; console.log(`  SLIPPED ${id}: ${MUTATIONS[id].why}`); }
    }
    console.log(slipped ? `bank-move-many --selftest: ${slipped} mutation(s) SLIPPED` : `bank-move-many --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('bank-move-many: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('bank-move-many: many stacks in one call = N single calls (M1-M12 green): journal and state byte-identical, all or nothing, named refusals, one key, one token, lock order pinned, ACL closed, re-apply a no-op');
  process.exit(0);
} catch (e) {
  console.error(`bank-move-many: HARNESS ERROR — ${e.message}`);
  process.exit(2);
}
