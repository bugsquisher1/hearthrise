#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hero-slot-buy.mjs — THE HERO-SLOT PURCHASE, GRADED AGAINST REAL
//                           POSTGRESQL.
//
//   node tests/hero-slot-buy.mjs             # the guard
//   node tests/hero-slot-buy.mjs --list      # the mutation catalogue
//   node tests/hero-slot-buy.mjs --selftest  # every mutation must be CAUGHT
//   node tests/hero-slot-buy.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-08-hero-slot-buy.sql
//             src/net/goal-claim.js buyHeroSlot() · src/net/accrue.js
//             reconcileHeroSlots() · src/multi-character.js buySlot()
//
// ── THE DEFECTS THIS EXISTS FOR (all three live on production) ──────────
//  1. The Buy button is LIT AND DEAD. hr_unlock_offers carries the four
//     character_slot rows with refusal='namespace_unsupported:character_slot'
//     and gold=null (a hero slot is priced in GEMS; that catalogue has a gold
//     column and no other), so hr_unlock_buy refuses the namespace by
//     construction. The only other path — multi-character.js unlockSlot() — is
//     a client-side `G.gems -= cost`, and gems are SERVER-OF-RECORD and ARMED,
//     so the next envelope reconciles the debit away.
//  2. Ownership is client-authored in the G.heroSlotsUnlocked residue. That is
//     the b371 gem dupe multi-character.js's own header documents: a restore
//     reverted the gems and KEPT the slot — "the purchase became free".
//  3. hr_create_character(p_slot) validated p_slot for SHAPE ONLY, so
//     {"p_slot":4} minted a fifth character with a full starting kit for free.
//     The whole 3,100-gem ladder, bypassed by one fetch, five times over.
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite (real PostgreSQL, in process), then a real player through the REAL
// rate-gated RPC as `authenticated` with a JWT subject set. It also BINDS THE
// THREE COPIES OF THE PRICE LADDER that must never disagree:
//   (A) src/multi-character.js  SLOT_COSTS_GEMS — the authored source, what the
//       drawer and the Home rail render and what tools/gen-shops.mjs reads;
//   (B) src/data/shops.js       SHOP_OFFERS — the generated ESM catalogue Node
//       and Deno import;
//   (C) public.hr_hero_slots    — what the server CHARGES.
// A slot the server cannot sell, a slot the client cannot see, or a price that
// differs by one gem fails the build BY NAME, in whichever pair disagrees.
//
// ⚠ NO NUMBER IN THIS FILE IS TYPED (the TESTING.md fixture rule). Every gem
//   figure below is read from (A) at run time and every character is created by
//   the REAL hr_create_character, so a Designer retune of the ladder moves the
//   guard with it instead of turning it red with a message about the wrong
//   thing.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend, so the two advisory locks and
//     the `for update` are asserted PRESENT and exercised serially. What makes
//     the race safe is the ACCOUNT-level (slot 0) lock plus the already_owned
//     refusal plus the idempotency cache, and all three are exercised.
//   · The pooler, PostgREST and the JWT itself.
//   · Production's ACL — §10 of the migration asserts it at apply time.
//   · The CLIENT half (the transport, the arm gate, the honest button) — that
//     is src/features/smoke-test.js's SLOT-SRV battery.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MIG = '2026-09-08-hero-slot-buy.sql';
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each is a defect somebody could plausibly write, and each must turn this
   guard RED. A guard that cannot demonstrate it sees failure is broken, not
   passing. */
const MUTATIONS = {
  no_ownership_check: {
    why: 'THE MONEY DEFECT: the already_owned refusal is deleted, so a second purchase of a slot '
       + 'the account already holds charges again — an unbounded premium-currency sink behind one '
       + 'button, and a re-buy that answers ok:true for a purchase that changed nothing',
    find: `  if v_owned @> to_jsonb(v_cat.slot_id) then
    return jsonb_build_object('ok', false, 'error', 'already_owned',
      'slot_id', v_cat.slot_id, 'hero_slots', v_owned);
  end if;`,
    repl: '  -- already_owned removed',
  },
  ladder_ignored: {
    why: 'the ladder stops being enforced, so the 1,500-gem slot 4 can be bought without the 200 + '
       + '500 + 900 beneath it. The price of the top slot IS the ladder; without the order check '
       + 'the account buys one slot and skips 1,600 gems',
    find: '  if not (v_owned @> to_jsonb(v_cat.slot_id - 1)) then',
    repl: '  if false then',
  },
  gems_may_go_negative: {
    why: 'the affordability check is removed, so an account with 0 gems buys the slot and the '
       + 'server-owned premium balance goes NEGATIVE — the exact client-authored debit this verb '
       + 'replaced, now on the server side of the wire',
    find: '  if v_have < v_cat.cost_gems then',
    repl: '  if false then',
  },
  flag_written_on_calling_slot: {
    why: 'THE ACCOUNT/CHARACTER SPLIT, inverted: the ownership flag is filed under the CALLING '
       + 'character instead of the account row (slot 0). A slot bought while playing Hero 2 is '
       + 'then invisible from Hero 1 — the entitlement becomes per-character, which it is not, and '
       + 'the player is charged again from the other hero',
    find: `  values (v_uid, 0, 'flag', 'character_slot:' || v_cat.slot_id, 1, '', null, now())`,
    repl: `  values (v_uid, v_slot, 'flag', 'character_slot:' || v_cat.slot_id, 1, '', null, now())`,
  },
  no_account_lock: {
    why: 'the ACCOUNT-level (slot 0) advisory lock is dropped, leaving only the per-character key. '
       + 'Two characters of one account buying the same hero slot then take DIFFERENT locks, both '
       + 'pass already_owned and both charge. PGlite cannot run the race, so this is caught '
       + 'STATICALLY — the lock has to be visible in the body',
    find: `  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || '0', 0));`,
    repl: '  -- account lock removed',
  },
  grandfather_dropped: {
    why: 'an EXISTING character no longer counts as ownership. Production carries ZERO '
       + 'character_slot flag rows and one account with heroes on slots 0 AND 1, so this evicts a '
       + 'real player from their own second character on the first envelope — and then SELLS them '
       + 'the slot they already play',
    find: `    select ps.slot
      from public.player_state ps
     where ps.user_id = p_user and ps.slot > 0`,
    repl: `    select ps.slot
      from public.player_state ps
     where ps.user_id = p_user and ps.slot > 99`,
  },
  create_gate_removed: {
    why: 'THE FREE-CHARACTER MINT, restored: hr_create_character stops asking whether the account '
       + 'owns the slot, so {"p_slot":4} again mints a fifth character with a full starting kit '
       + 'for nothing and the entire gem ladder is decoration',
    find: `'  if v_slot > 0 and not (public.hr_hero_slots_of(v_uid) @> to_jsonb(v_slot)) then' || chr(10) ||`,
    repl: `'  if false then' || chr(10) ||`,
  },
  create_gate_locks_out_existing: {
    why: 'the entitlement gate is moved AHEAD of the existing-row fast path, so a grandfathered '
       + 'character — or one whose owner\'s premium lapsed — can no longer be ensured and the '
       + 'player is locked out of a hero they are standing in. Fail-closed in the wrong direction',
    find: `  if v_slot > 0 and not (public.hr_hero_slots_of(v_uid) @> to_jsonb(v_slot)) then`,
    repl: `  if v_slot > 0 and not ('[0]'::jsonb @> to_jsonb(v_slot)) then`,
  },
  idem_not_read: {
    why: 'the idempotency cache is never read, so a retry of one gesture (a dropped response, a '
       + 'double tap) debits a second time — 200 to 1,500 gems, twice, for one click',
    find: `  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;`,
    repl: '  -- idempotency read removed',
  },
  refusals_cached: {
    why: 'a REFUSAL is cached under the idempotency key, so "you are 450 gems short" becomes '
       + 'permanent for that key — the player earns the gems and the same gesture still refuses',
    find: `    return jsonb_build_object('ok', false, 'error', 'insufficient_gems',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gems, 'have', v_have,
      'short_by', v_cat.cost_gems - v_have);`,
    repl: `    if p_idem is not null then
      insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
        values (v_uid, p_idem, v_slot, v_intent, jsonb_build_object('ok', false,
                'error', 'insufficient_gems'), now())
        on conflict (user_id, intent_id) do nothing;
    end if;
    return jsonb_build_object('ok', false, 'error', 'insufficient_gems',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gems, 'have', v_have,
      'short_by', v_cat.cost_gems - v_have);`,
  },
  premium_becomes_a_free_price: {
    why: 'the Hearth Hall waiver is moved OUT of the ownership predicate, which is where it stops '
       + 'being safe: the client derives premium from `localStorage[\'hearthrise:profile\']`, a '
       + 'device-local string nothing in the shipped build ever writes, so the waiver has to be a '
       + 'server-side fact about OWNERSHIP and not a price of zero',
    find: `    select c.slot_id
      from public.hr_hero_slots c
     where c.premium_waived
       and exists (select 1 from public.player_progress e`,
    repl: `    select c.slot_id
      from public.hr_hero_slots c
     where false and c.premium_waived
       and exists (select 1 from public.player_progress e`,
  },
  envelope_drops_hero_slots: {
    why: 'hr_state_of stops projecting the owned slot set, so ownership has no server load path '
       + 'and the client falls back to the G.heroSlotsUnlocked residue — which is the b371 store '
       + 'a cloud restore rewinds while the slot stays granted. The whole point of the projection',
    find: "  if strpos(v_def, $q$'hero_slots', public.hr_hero_slots_of$q$) > 0 then\n    raise notice 'hr_state_of already projects hero_slots — patch skipped'; return;\n  end if;",
    repl: "  if true then\n    raise notice 'hr_state_of hero_slots projection skipped'; return;\n  end if;",
  },
  projection_is_character_scoped: {
    why: 'the hero_slots projection is keyed on the CHARACTER rather than the account, so the '
       + 'drawer shows a different set of heroes depending on which hero you are playing — and a '
       + 'slot bought on Hero 2 vanishes the moment you switch back',
    find: `    ''hero_slots'', public.hr_hero_slots_of(p_user),');`,
    repl: `    ''hero_slots'', (case when v_st.slot = 0 then public.hr_hero_slots_of(p_user) else ''[0]''::jsonb end),');`,
  },
  wrong_gate_bucket: {
    why: 'the rate-gate patch names a bucket the wrapper does not use. An UNKNOWN bucket fails '
       + 'CLOSED, so every hero-slot purchase in the game answers 429 through a green deploy — the '
       + 'lit-and-dead button, restored in a new place',
    find: "    'when ''hr_buy_hero_slot'' then v_limit := 12;' || chr(10) ||",
    repl: "    'when ''hr_buy_hero_slot_x'' then v_limit := 12;' || chr(10) ||",
  },
  no_arg_defaults: {
    why: 'the wrapper loses its argument defaults, so a client posting {p_slot_id, p_slot} gets '
       + 'PGRST202 — a 404 indistinguishable from "the migration was never applied" — and every '
       + 'Buy button stays dead through a green deploy',
    find: '  p_slot_id int, p_slot int default 0, p_idem uuid default null)',
    repl: '  p_slot_id int, p_slot int, p_idem uuid)',
  },
  price_drifts_from_the_client: {
    why: 'a hand edits ONE gem price in the server catalogue. The shop advertises one number and '
       + 'the server charges another — the class the three-way bind exists to make impossible',
    find: `  (2, 'Character slot 3',  500, true),`,
    repl: `  (2, 'Character slot 3',  450, true),`,
  },
};

const UUID = () => crypto.randomUUID();

/* ── (A) THE AUTHORED LADDER, PARSED OUT OF ITS OWN FILE ─────────────────
   Parsed rather than duplicated: a second copy of game data is the failure this
   repo has been burned by (src/main.js unifyObject). Returns
   {costs:[0,200,…], maxSlots:5, premiumHi:3}. */
async function authoredLadder() {
  const src = await readFile(join(ROOT, 'src', 'multi-character.js'), 'utf8');
  const m = /const\s+SLOT_COSTS_GEMS\s*=\s*\[([^\]]*)\]/.exec(src);
  const cap = /const\s+MAX_SLOTS\s*=\s*(\d+)/.exec(src);
  /* The premium waiver's authored rule, read from the one expression that owns
     it rather than assumed: `free = hasPremium && nextId >= 1 && nextId <= 3`. */
  const prem = /hasPremium\s*&&\s*\w+\s*>=\s*1\s*&&\s*\w+\s*<=\s*(\d+)/.exec(src);
  return {
    costs: m ? m[1].split(',').map((s) => Number(s.trim())) : null,
    maxSlots: cap ? Number(cap[1]) : null,
    premiumHi: prem ? Number(prem[1]) : null,
    hasBuySlot: /HearthriseProfile[\s\S]*buySlot/.test(src),
    src,
  };
}

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

  const newPlayer = async (email) => {
    const uid = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
    [uid, email]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
    await gate();
    /* THE PRODUCER'S REAL OUTPUT (the fixture rule): the character is made by
       the same RPC the live client calls, so its starting kit, its flag rows and
       its version are whatever production would actually give it. */
    const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
    ok(cr?.ok === true, `FIXTURE: hr_create_character refused for ${email}: ${JSON.stringify(cr)}`);
    return uid;
  };

  const gemsOf = async (uid, slot) => Number((await q(
    'select gems::text g from player_state where user_id=$1 and slot=$2', [uid, slot]))[0]?.g);
  const setGems = (uid, slot, n) => q(
    'update public.player_state set gems = $3 where user_id = $1 and slot = $2', [uid, slot, n]);
  const flagRows = (uid) => q(
    "select slot, key, value::text v from player_progress where user_id=$1 "
    + "and kind='flag' and key like 'character\\_slot:%' order by slot, key", [uid]);
  const ownedOf = async (uid) => (await q('select public.hr_hero_slots_of($1) as r', [uid]))[0].r;

  const buy = async (uid, slotId, charSlot = 0, idem = null) => {
    await gate();
    return asUser(uid, 'select public.hr_buy_hero_slot($1,$2,$3) as r', [slotId, charSlot, idem]);
  };
  const create = async (uid, slot) => {
    await gate();
    return asUser(uid, 'select public.hr_create_character($1) as r', [slot]);
  };

  const obs = {};

  /* THE CATALOGUE FIRST — every number below is read from it, never typed. */
  obs.catalogue = await q('select slot_id, name, cost_gems::text cost, premium_waived '
    + 'from public.hr_hero_slots order by slot_id');
  const cost = (n) => Number(obs.catalogue.find((r) => r.slot_id === n)?.cost);

  // ── A. THE MAIN ACCOUNT ───────────────────────────────────────────────
  const uid = await newPlayer('heroslot@probe.invalid');
  obs.a_fresh_owned = await ownedOf(uid);

  // A1. SHAPE + CATALOGUE REFUSALS, nothing moved.
  await setGems(uid, 0, cost(1));
  obs.a1_bad   = await buy(uid, 9, 0, UUID());
  obs.a1_zero  = await buy(uid, 0, 0, UUID());
  obs.a1_over  = await buy(uid, 5, 0, UUID());
  obs.a1_gems  = await gemsOf(uid, 0);

  // A2. THE LADDER: slot 2 before slot 1.
  obs.a2 = await buy(uid, 2, 0, UUID());
  obs.a2_gems = await gemsOf(uid, 0);

  // A3. THE PURCHASE. Exact debit, flag on the ACCOUNT row, envelope hydrates.
  const idem1 = UUID();
  obs.a3 = await buy(uid, 1, 0, idem1);
  obs.a3_gems = await gemsOf(uid, 0);
  obs.a3_flags = await flagRows(uid);
  obs.a3_owned = await ownedOf(uid);

  // A4. REPLAY on the same key: the ORIGINAL envelope, no second debit.
  obs.a4 = await buy(uid, 1, 0, idem1);
  obs.a4_gems = await gemsOf(uid, 0);

  // A5. A DIFFERENT key for an owned slot is refused, not silently re-sold.
  obs.a5 = await buy(uid, 1, 0, UUID());
  obs.a5_gems = await gemsOf(uid, 0);

  // A6. THE CREATE GATE. Slot 1 is owned; slot 2 and slot 4 are not.
  obs.a6_owned_ok = await create(uid, 1);
  obs.a6_unowned  = await create(uid, 2);
  obs.a6_top      = await create(uid, 4);
  obs.a6_rows = Number((await q(
    'select count(*)::text c from player_state where user_id=$1', [uid]))[0].c);
  obs.a6_free_slot = await create(uid, 0);

  // A7. SHORT OF GEMS: refused by name, nothing moved, NOT cached — and the
  //     SAME key works once the gems arrive. That is the difference between an
  //     honest refusal and a permanent one.
  const shortIdem = UUID();
  await setGems(uid, 0, cost(2) - 1);
  obs.a7 = await buy(uid, 2, 0, shortIdem);
  obs.a7_gems = await gemsOf(uid, 0);
  obs.a7_cached = Number((await q(
    'select count(*)::text c from player_intents where user_id=$1 and intent_id=$2',
    [uid, shortIdem]))[0].c);
  await setGems(uid, 0, cost(2));
  obs.a7_after = await buy(uid, 2, 0, shortIdem);
  obs.a7_after_gems = await gemsOf(uid, 0);

  // ── B. THE ACCOUNT/CHARACTER SPLIT ────────────────────────────────────
  //   The money comes from the CALLING character (the wallet the topbar shows);
  //   the entitlement lands on the ACCOUNT row and is read account-wide.
  await setGems(uid, 0, 0);
  await setGems(uid, 1, cost(3));
  const idem3 = UUID();
  obs.b1 = await buy(uid, 3, 1, idem3);
  obs.b1_gems_slot0 = await gemsOf(uid, 0);
  obs.b1_gems_slot1 = await gemsOf(uid, 1);
  obs.b1_flags = await flagRows(uid);
  // …and every character reports the SAME set.
  await db.exec('set role hr_engine');
  try {
    obs.b1_env0 = (await db.query('select public.hr_state_of($1, 0) as r', [uid])).rows[0]?.r;
    obs.b1_env1 = (await db.query('select public.hr_state_of($1, 1) as r', [uid])).rows[0]?.r;
  } finally { await db.exec('reset role').catch(() => {}); }

  // B2. ONE ledger row per credited purchase, no inflow, signed gems in meta.
  obs.ledger = await q(
    "select slot, intent, kind, gold::text gold, gold_in::text gold_in, gems_in::text gems_in, "
    + "meta from player_ledger where user_id=$1 and kind='hero_slot' order by intent", [uid]);

  // ── C. THE GRANDFATHER ACCOUNT ────────────────────────────────────────
  //   The PRODUCTION SHAPE, measured 2026-09-08: zero character_slot flag rows
  //   anywhere, and one account with characters on slots 0 AND 1. The row is
  //   inserted directly (not bought) precisely because that is what a
  //   pre-migration character looks like.
  const gid = await newPlayer('grandfather@probe.invalid');
  await q('insert into public.player_state (user_id, slot, gold, gems, version) '
    + 'values ($1, 1, 0, 0, 1) on conflict do nothing', [gid]);
  await setGems(gid, 0, cost(1) * 4);
  obs.c_owned = await ownedOf(gid);
  obs.c_flags = await flagRows(gid);
  obs.c_rebuy = await buy(gid, 1, 0, UUID());
  obs.c_gems  = await gemsOf(gid, 0);
  obs.c_ensure = await create(gid, 1);
  obs.c_next  = await buy(gid, 2, 0, UUID());   // slot 1 grandfathered ⇒ ladder satisfied

  // ── D. THE PREMIUM WAIVER IS OWNERSHIP, NOT A PRICE OF ZERO ───────────
  const pid = await newPlayer('premium@probe.invalid');
  await q("insert into public.player_progress (user_id, slot, kind, key, value, period_key, "
    + "updated_at) values ($1, 0, 'flag', 'entitlement:hearthHall', 1, '', now()) "
    + 'on conflict do nothing', [pid]);
  await setGems(pid, 0, cost(4));
  obs.d_owned = await ownedOf(pid);
  obs.d_waived = await buy(pid, 1, 0, UUID());
  obs.d_gems_after_waived = await gemsOf(pid, 0);
  obs.d_top = await buy(pid, 4, 0, UUID());     // slot 4 is NOT waived
  obs.d_gems = await gemsOf(pid, 0);
  obs.d_flags = await flagRows(pid);
  /* CONTROL: the waiver must not have granted a stored flag for 1-3. If it had,
     the "no free path" property would be satisfied by a function that writes
     ownership rows without charging. */
  obs.d_waived_flags = obs.d_flags.filter((r) => r.key !== 'character_slot:4').length;

  // ── E. CROSS-VERB KEY REUSE IS REFUSED (the intent-mismatch class) ─────
  const eid = await newPlayer('idem@probe.invalid');
  await setGems(eid, 0, cost(1));
  const shared = UUID();
  await gate();
  obs.e_other = await asUser(eid, 'select public.hr_put_client_state($1,$2,$3) as r',
    [0, JSON.stringify({ ui: { tab: 'home' } }), shared]);
  obs.e_reuse = await buy(eid, 1, 0, shared);
  obs.e_gems = await gemsOf(eid, 0);

  // ── F. THE CONTROL: A FRESH ACCOUNT OWNS ONLY SLOT 0 AND BUYS NOTHING ─
  const fid = await newPlayer('control@probe.invalid');
  obs.f_owned = await ownedOf(fid);
  obs.f_buy = await buy(fid, 1, 0, UUID());
  obs.f_create = await create(fid, 1);

  // ── G. THE TWO-ARGUMENT CALL FORM RESOLVES (PGRST202 insurance) ───────
  await gate();
  try {
    obs.g_two = await asUser(fid, 'select public.hr_buy_hero_slot($1,$2) as r', [9, 0]);
    obs.g_error = null;
  } catch (e) { obs.g_two = null; obs.g_error = String(e.message || e).split('\n')[0]; }

  // ── H. THE GATE, THE GRANTS AND THE BODY SHAPE ────────────────────────
  obs.gateBuckets = (await q(
    "select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) as r"))[0].r;
  obs.acl = (await q(
    `select has_function_privilege('authenticated','public.hr_buy_hero_slot(int,int,uuid)','execute') wrapper,
            has_function_privilege('authenticated','public.hr_buy_hero_slot__ungated(int,int,uuid)','execute') inner_,
            has_function_privilege('anon','public.hr_buy_hero_slot(int,int,uuid)','execute') anon_,
            has_function_privilege('hr_engine','public.hr_buy_hero_slot(int,int,uuid)','execute') engine,
            has_function_privilege('authenticated','public.hr_hero_slots_of(uuid)','execute') predicate,
            has_function_privilege('authenticated','public.hr_create_character(int)','execute') ensure_`))[0];
  obs.catalogueGrants = Number((await q(
    "select count(*)::text c from information_schema.role_table_grants where table_schema='public' "
    + "and table_name='hr_hero_slots' and grantee in ('anon','authenticated','service_role','PUBLIC')"))[0].c);
  obs.body = (await q("select replace(pg_get_functiondef("
    + "'public.hr_buy_hero_slot__ungated(int,int,uuid)'::regprocedure), chr(13), '') as r"))[0].r;
  obs.createBody = (await q("select replace(pg_get_functiondef("
    + "'public.hr_create_character(int)'::regprocedure), chr(13), '') as r"))[0].r;
  obs.ledgerKinds = (await q(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check'`))[0].d;

  await db.close?.();
  return obs;
}

/** Grade one run. Every assertion names the PROPERTY, not the line. */
function grade(o) {
  const cat = new Map((o.catalogue || []).map((r) => [r.slot_id, r]));
  const cost = (n) => Number(cat.get(n)?.cost);

  // ── A ────────────────────────────────────────────────────────────────
  ok(JSON.stringify(o.a_fresh_owned) === '[0]',
    `A: a fresh account owns ${JSON.stringify(o.a_fresh_owned)}, expected [0] — slot 0 is free and `
    + 'is the only thing an account starts with');

  ok(o.a1_bad?.error === 'bad_slot', `A1: an out-of-range slot_id was not refused: ${JSON.stringify(o.a1_bad)}`);
  ok(o.a1_zero?.error === 'unknown_slot',
    `A1: slot 0 is FREE and uncatalogued and must answer unknown_slot: ${JSON.stringify(o.a1_zero)}`);
  ok(o.a1_over?.error === 'unknown_slot',
    `A1: slot 5 is past the hard cap and must answer unknown_slot: ${JSON.stringify(o.a1_over)}`);
  ok(o.a1_gems === cost(1), `A1: a catalogue refusal moved gems (${o.a1_gems})`);

  ok(o.a2?.error === 'requires_previous_slot' && Number(o.a2?.requires) === 1,
    `A2: THE LADDER: slot 2 was sold without slot 1: ${JSON.stringify(o.a2)}`);
  ok(o.a2_gems === cost(1), `A2: the refused out-of-order purchase moved gems (${o.a2_gems})`);

  ok(o.a3?.ok === true, `A3: the purchase did not go through: ${JSON.stringify(o.a3)}`);
  ok(o.a3_gems === 0,
    `A3: the purchase left ${o.a3_gems} gems, expected ${cost(1)} - ${cost(1)} = 0`);
  ok(Number(o.a3?.cost) === cost(1),
    `A3: the receipt quotes ${o.a3?.cost} gems, the catalogue says ${cost(1)}`);
  ok(o.a3_flags?.length === 1 && o.a3_flags[0].slot === 0
     && o.a3_flags[0].key === 'character_slot:1',
    `A3: the ownership row is ${JSON.stringify(o.a3_flags)} — it must be exactly one row, on the `
    + 'ACCOUNT row (slot 0), because a hero slot is an account entitlement');
  ok(JSON.stringify(o.a3_owned) === '[0,1]',
    `A3: after buying slot 1 the account owns ${JSON.stringify(o.a3_owned)}, expected [0,1]`);
  ok(JSON.stringify(o.a3?.hero_slots) === '[0,1]',
    `A3: the envelope reports hero_slots ${JSON.stringify(o.a3?.hero_slots)} — one answer must `
    + 'hydrate the whole client, not a delta');

  ok(o.a4?.replayed === true && o.a4?.ok === true,
    `A4: the idempotent retry did not replay the original envelope: ${JSON.stringify(o.a4)}`);
  ok(o.a4_gems === 0, `A4: the replay RE-DEBITED (gems ${o.a4_gems}, expected 0)`);

  ok(o.a5?.error === 'already_owned', `A5: a re-buy was not refused: ${JSON.stringify(o.a5)}`);
  ok(o.a5_gems === 0, `A5: the refused re-buy moved gems (${o.a5_gems})`);

  ok(o.a6_owned_ok?.ok === true,
    `A6: a slot the account OWNS could not be created: ${JSON.stringify(o.a6_owned_ok)}`);
  ok(o.a6_unowned?.error === 'slot_not_owned',
    `A6 THE FREE-CHARACTER MINT: hr_create_character(2) answered ${JSON.stringify(o.a6_unowned)} `
    + 'for an account that owns [0,1]. {"p_slot":N} mints a character with a full starting kit '
    + 'and bypasses the entire gem ladder.');
  ok(o.a6_top?.error === 'slot_not_owned',
    `A6: hr_create_character(4) — the 1,500-gem slot — answered ${JSON.stringify(o.a6_top)}`);
  ok(o.a6_rows === 2,
    `A6: the account holds ${o.a6_rows} character rows, expected 2 (slots 0 and 1). A refused `
    + 'create must insert nothing.');
  ok(o.a6_free_slot?.ok === true,
    `A6: the FREE slot 0 was refused by the entitlement gate: ${JSON.stringify(o.a6_free_slot)}`);

  ok(o.a7?.error === 'insufficient_gems' && Number(o.a7?.cost) === cost(2)
     && Number(o.a7?.short_by) === 1,
    `A7: a short purchase was not refused by name: ${JSON.stringify(o.a7)}`);
  ok(o.a7_gems === cost(2) - 1, `A7: the refused purchase moved gems (${o.a7_gems})`);
  ok(o.a7_cached === 0,
    'A7: a REFUSAL was cached under its idempotency key — the player could never buy it with that '
    + 'key once the gems arrived');
  ok(o.a7_after?.ok === true,
    `A7: the once-refused purchase did not go through with the SAME key after topping up: `
    + JSON.stringify(o.a7_after));
  ok(o.a7_after_gems === 0, `A7: slot 2 left ${o.a7_after_gems} gems, expected 0`);

  // ── B ────────────────────────────────────────────────────────────────
  ok(o.b1?.ok === true, `B1: the cross-character purchase failed: ${JSON.stringify(o.b1)}`);
  ok(o.b1_gems_slot1 === 0,
    `B1: the CALLING character's wallet was not the one charged (slot 1 holds ${o.b1_gems_slot1} `
    + `gems, expected 0). The topbar gem chip shows the ACTIVE character's balance, so charging `
    + 'any other row takes gems the player cannot see.');
  ok(o.b1_gems_slot0 === 0,
    `B1: slot 0's wallet moved (${o.b1_gems_slot0}) on a purchase charged to slot 1`);
  ok(o.b1_flags?.every((r) => r.slot === 0),
    `B1: an ownership flag was filed under a character rather than the account: `
    + JSON.stringify(o.b1_flags));
  ok(JSON.stringify(o.b1_env0?.hero_slots) === JSON.stringify(o.b1_env1?.hero_slots),
    `B1: hr_state_of reports ${JSON.stringify(o.b1_env0?.hero_slots)} on slot 0 and `
    + `${JSON.stringify(o.b1_env1?.hero_slots)} on slot 1. A hero slot is an ACCOUNT entitlement; `
    + 'every character must report the same set or the drawer changes when you switch hero.');
  ok(Array.isArray(o.b1_env0?.hero_slots) && o.b1_env0.hero_slots.length === 4,
    `B1: the envelope projects ${JSON.stringify(o.b1_env0?.hero_slots)}, expected [0,1,2,3]`);
  ok(o.b1_env0?.state && o.b1_env0.state.gems !== undefined && o.b1_env0.traits !== undefined,
    'B1: the hero_slots patch DROPPED a sibling projection from hr_state_of');

  ok(o.ledger?.length === 3,
    `B2: expected 3 hero_slot ledger rows (one per credited purchase), found ${o.ledger?.length}`);
  for (const r of o.ledger || []) {
    ok(Number(r.gold_in) === 0 && Number(r.gems_in) === 0 && Number(r.gold) === 0,
      `B2: '${r.intent}' journalled inflow (gold ${r.gold} / gold_in ${r.gold_in} / gems_in `
      + `${r.gems_in}) — a hero-slot purchase MINTS nothing and must not consume the accrual `
      + 'inflow budget');
    ok(Number(r.meta?.gems) < 0,
      `B2: '${r.intent}' does not record the signed NEGATIVE gem movement in meta.gems: `
      + JSON.stringify(r.meta));
  }
  ok(/'hero_slot'/.test(o.ledgerKinds || ''),
    "B2: player_ledger_kind_check does not admit 'hero_slot' — the journal insert would 23514 and "
    + 'roll the whole purchase back');
  for (const k of ['accrue', 'trait', 'bounty', 'shop', 'bank', 'worker', 'daily']) {
    ok(new RegExp(`'${k}'`).test(o.ledgerKinds || ''),
      `B2: the ledger-kind widen DELETED the '${k}' kind — it is not additive`);
  }

  // ── C. GRANDFATHER ───────────────────────────────────────────────────
  ok(o.c_flags?.length === 0,
    `C: the grandfather fixture is not the production shape — it carries ${o.c_flags?.length} `
    + 'character_slot flag row(s). Production has ZERO; that is the whole point of the clause.');
  ok(JSON.stringify(o.c_owned) === '[0,1]',
    `C: an account with an EXISTING slot-1 character and no flag row owns ${JSON.stringify(o.c_owned)}, `
    + 'expected [0,1]. Without the grandfather clause the projection evicts a real player from '
    + 'their own second hero on the first envelope.');
  ok(o.c_rebuy?.error === 'already_owned',
    `C: a GRANDFATHERED slot was not refused already_owned: ${JSON.stringify(o.c_rebuy)} — the `
    + 'player would be sold a slot they are already playing');
  ok(o.c_gems === cost(1) * 4, `C: the grandfathered refusal charged the player (${o.c_gems})`);
  ok(o.c_ensure?.ok === true,
    `C: a GRANDFATHERED character could not be ensured (${JSON.stringify(o.c_ensure)}) — the `
    + 'entitlement gate locked a real player out of their own hero');
  ok(o.c_next?.ok === true,
    `C: the ladder did not accept a grandfathered rung — slot 2 answered ${JSON.stringify(o.c_next)}`);

  // ── D. PREMIUM ───────────────────────────────────────────────────────
  ok(JSON.stringify(o.d_owned) === '[0,1,2,3]',
    `D: Hearth Hall owns ${JSON.stringify(o.d_owned)}, expected [0,1,2,3] — the waiver is a fact `
    + 'about OWNERSHIP, read server-side, not a device-local localStorage claim');
  ok(o.d_waived?.error === 'already_owned',
    `D: a premium-waived slot ran a PURCHASE instead of answering already_owned: `
    + `${JSON.stringify(o.d_waived)}. There must be no code path that grants a slot for zero gems.`);
  ok(o.d_gems_after_waived === cost(4),
    `D: the waived refusal moved gems (${o.d_gems_after_waived})`);
  ok(o.d_top?.ok === true && Number(o.d_top?.cost) === cost(4),
    `D: slot 4 is NOT waived by Premium and must still cost ${cost(4)}: ${JSON.stringify(o.d_top)}`);
  ok(o.d_gems === 0, `D: slot 4 left ${o.d_gems} gems, expected 0`);
  ok(o.d_waived_flags === 0,
    `D: the waiver wrote ${o.d_waived_flags} stored ownership row(s) — a waived slot must be owned `
    + 'by the PREDICATE, never granted by a write that skipped the debit');

  // ── E. CROSS-VERB KEY REUSE ──────────────────────────────────────────
  ok(o.e_other?.ok === true,
    `E fixture: hr_put_client_state refused, so the key was never claimed: ${JSON.stringify(o.e_other)}`);
  ok(o.e_reuse?.error === 'intent_mismatch',
    `E: a key already claimed by client_state_put was accepted by hr_buy_hero_slot, which answered `
    + `${JSON.stringify(o.e_reuse)}. player_intents is ONE namespace for every verb; a stale key `
    + 'must be refused, not answered with another intent\'s decision.');
  ok(o.e_gems === cost(1), `E: the refused reuse moved gems (${o.e_gems})`);

  // ── F. THE CONTROL ───────────────────────────────────────────────────
  ok(JSON.stringify(o.f_owned) === '[0]',
    `F CONTROL: a fresh account owns ${JSON.stringify(o.f_owned)} — every assertion above is `
    + 'satisfied by a function that grants to everybody');
  ok(o.f_buy?.error === 'insufficient_gems',
    `F CONTROL: a penniless account was sold a slot: ${JSON.stringify(o.f_buy)}`);
  ok(o.f_create?.error === 'slot_not_owned',
    `F CONTROL: a fresh account minted a second character: ${JSON.stringify(o.f_create)}`);

  // ── G ────────────────────────────────────────────────────────────────
  ok(o.g_two?.error === 'bad_slot',
    `G: the TWO-argument call form did not resolve (${o.g_error || JSON.stringify(o.g_two)}). `
    + 'PostgREST resolves an RPC by its NAMED ARGUMENTS; without defaults it answers PGRST202 and '
    + 'the whole feature deploys green and dead.');

  // ── H. GATE / GRANTS / BODY SHAPE ────────────────────────────────────
  ok(/'hr_buy_hero_slot'/.test(o.gateBuckets || ''),
    'H: hr_rpc_gate does not admit hr_buy_hero_slot — an unknown bucket fails CLOSED, so every '
    + 'purchase answers 429 through a green deploy');
  for (const b of ['hr_trait_buy', 'hr_bounty_spend', 'bank_move', 'client_state_put',
    'farm_plant', 'clan_deposit']) {
    ok(new RegExp(`'${b}'`).test(o.gateBuckets || ''),
      `H: the hr_rpc_gate patch DELETED the '${b}' bucket — the programmatic patch is not additive`);
  }
  ok(o.acl?.wrapper === true, 'H: the wrapper is not callable by authenticated — the feature is dead');
  ok(o.acl?.inner_ === false, 'H: the __ungated inner is client-executable — the rate gate is decoration');
  ok(o.acl?.anon_ === false, 'H: hr_buy_hero_slot is anon-executable');
  ok(o.acl?.engine === false,
    'H: hr_engine can call hr_buy_hero_slot — the accrual engine must never buy a premium slot for '
    + 'anybody');
  ok(o.acl?.predicate === false,
    'H: hr_hero_slots_of is client-executable — it takes a uuid ARGUMENT, so that is "read any '
    + 'account\'s entitlements" as any signed-in client');
  ok(o.acl?.ensure_ === true,
    'H: the §8 patch left hr_create_character uncallable by authenticated — every new player would '
    + 'be unable to create a character at all');
  ok(o.catalogueGrants === 0,
    `H: ${o.catalogueGrants} client grant(s) on hr_hero_slots — the price would be readable and, `
    + 'worse, a policy away from writable');

  /* THE ACCOUNT LOCK, asserted STATICALLY. PGlite is one backend so the race is
     unreachable; what makes it safe is that the slot-0 key is taken on EVERY
     call regardless of which character is buying, and that is visible in the
     body. */
  ok(/pg_advisory_xact_lock\(hashtextextended\(v_uid::text \|\| ':' \|\| '0', 0\)\)/.test(o.body || ''),
    'H: the body does not take the ACCOUNT-level (slot 0) advisory lock. With only the '
    + 'per-character key, two characters of one account buying the same hero slot take DIFFERENT '
    + 'locks, both pass already_owned, and both charge.');
  ok(/select public\.hr_intent_replay\(v_uid, v_slot, p_idem, v_intent\)/.test(o.body || ''),
    'H: the body does not read the intent cache through hr_intent_replay — a key claimed by '
    + 'another verb would be answered with that verb\'s decision');
  ok(!/from public\.player_intents/.test(o.body || ''),
    'H: the body reads player_intents RAW, bypassing the (intent, slot) comparison');
  ok((o.body || '').indexOf('set gems = gems - v_cat.cost_gems') > 0
     && (o.body || '').indexOf('set gems = gems - v_cat.cost_gems')
        < (o.body || '').indexOf('insert into public.player_progress'),
    'H: the ownership grant is not downstream of the gem debit — there is a path that can grant a '
    + 'hero slot without charging for it');
  ok(/slot_not_owned/.test(o.createBody || ''),
    'H: hr_create_character carries no entitlement gate — the free-character mint is open and the '
    + 'whole gem ladder is decoration');
  for (const frag of ['hr_start_kit', 'player_skills', 'player_inventory', 'trait:auto_eat']) {
    ok((o.createBody || '').includes(frag),
      `H: the hr_create_character patch DROPPED ${frag} — it restated a body it does not own`);
  }

  return cat;
}

/* ── (A)↔(B)↔(C): the three copies of the ladder, no database ────────────
   The authored array, the generated ESM catalogue and the server table. Any
   pair disagreeing fails BY NAME, in both directions. */
async function bindGuard(cat) {
  const A = await authoredLadder();
  ok(Array.isArray(A.costs) && A.costs.length >= 2,
    'BIND: `const SLOT_COSTS_GEMS = [` could not be read out of src/multi-character.js — the '
    + 'authored ladder is unreadable, so nothing below asserts anything');
  if (!Array.isArray(A.costs)) return;
  ok(A.maxSlots === A.costs.length,
    `BIND: MAX_SLOTS is ${A.maxSlots} but SLOT_COSTS_GEMS has ${A.costs.length} rungs — the client `
    + 'itself disagrees about how many hero slots exist');
  ok(A.costs[0] === 0, `BIND: slot 0 is priced at ${A.costs[0]} gems; it must be free`);

  // (A) ↔ (C)
  for (let i = 1; i < A.costs.length; i++) {
    const c = cat.get(i);
    ok(!!c, `BIND: authored hero slot ${i} (${A.costs[i]} gems) is ABSENT from public.hr_hero_slots, `
      + 'so its Buy button is DEAD under the gems arm — the exact defect this migration exists for');
    if (!c) continue;
    ok(Number(c.cost) === A.costs[i],
      `BIND: slot ${i} costs ${A.costs[i]} gems in src/multi-character.js but ${c.cost} in `
      + 'hr_hero_slots — the drawer would advertise one price and the server would charge another');
    const wantWaived = A.premiumHi != null && i >= 1 && i <= A.premiumHi;
    ok(c.premium_waived === wantWaived,
      `BIND: slot ${i} is ${wantWaived ? '' : 'NOT '}waived by Hearth Hall on screen and `
      + `${c.premium_waived ? '' : 'NOT '}waived on the server — one of the two is selling a slot `
      + 'the other gives away');
  }
  for (const id of cat.keys()) {
    ok(id < A.costs.length && A.costs[id] > 0,
      `BIND: hr_hero_slots carries slot ${id}, which src/multi-character.js does not offer — the `
      + 'server would sell a slot the player can never see');
  }

  // (A) ↔ (B): the generated ESM catalogue the server-side tooling reads.
  const shops = await import(new URL('../src/data/shops.js', import.meta.url).href);
  const offers = (shops.SHOP_OFFERS || []).filter((o) => o.table === 'character_slot');
  ok(offers.length === A.costs.length - 1,
    `BIND: src/data/shops.js carries ${offers.length} character_slot offers, the authored ladder `
    + `has ${A.costs.length - 1} paid rungs. Re-run \`node tools/gen-shops.mjs\`.`);
  for (const off of offers) {
    const i = Number(String(off.id).split('.')[1]);
    const line = (off.cost || []).find((l) => l.kind === 'currency' && l.id === 'gems');
    ok(!!line, `BIND: generated offer ${off.id} is not priced in gems`);
    ok(line && line.amount === A.costs[i],
      `BIND: generated offer ${off.id} costs ${line && line.amount} gems, the authored ladder says `
      + `${A.costs[i]} — src/data/shops.js is stale; re-run \`node tools/gen-shops.mjs\``);
    const c = cat.get(i);
    ok(c && Number(c.cost) === (line && line.amount),
      `BIND: generated offer ${off.id} and public.hr_hero_slots disagree (${line && line.amount} `
      + `vs ${c && c.cost})`);
    ok((off.grant || []).some((g) => g.kind === 'unlock' && g.id === `character_slot:${i}`),
      `BIND: generated offer ${off.id} does not grant character_slot:${i} — the unlock id the '
      + 'server writes and the one the catalogue names have drifted`);
  }

  /* ── THE CLIENT HALF must exist, must send NO price, and must not be able to
     author ownership under the arm. Read the specific functions rather than the
     whole file: a scan that cannot tell a comment from a bug is a scan somebody
     deletes. */
  const gc = await readFile(join(ROOT, 'src', 'net', 'goal-claim.js'), 'utf8');
  ok(/buyHeroSlot:\s*function/.test(gc),
    'BIND: src/net/goal-claim.js has no buyHeroSlot transport — multi-character.js buySlot() would '
    + 'have nothing to call under the gems arm and every hero slot stays unbuyable');
  ok(/hr_buy_hero_slot/.test(gc), 'BIND: the client transport does not name hr_buy_hero_slot');
  const bAt = gc.indexOf('buyHeroSlot: function');
  if (bAt >= 0) {
    const fn = gc.slice(bAt, gc.indexOf('\n    /*', bAt + 10) < 0 ? bAt + 900
      : gc.indexOf('\n    /*', bAt + 10));
    ok(!/p_cost|p_price|p_currency|p_gems|p_free/.test(fn),
      'BIND: buyHeroSlot puts a PRICE, a CURRENCY, a BALANCE or a FREE flag on the wire. It may '
      + 'send a slot id, a character slot and an idempotency key and NOTHING else — the server owns '
      + `every number in this transaction. Body:\n${fn}`);
    for (const f of ['p_slot_id', 'p_slot', 'p_idem']) {
      ok(fn.includes(f), `BIND: buyHeroSlot does not send ${f} — PostgREST resolves an RPC by its `
        + 'named arguments, so a missing one is PGRST202 and a dead button');
    }
  }

  const mc = A.src;
  ok(/HearthriseGoalClaim[\s\S]{0,400}buyHeroSlot/.test(mc),
    'BIND: src/multi-character.js buySlot() does not route through the server transport — the '
    + 'purchase would still be the client-side G.gems debit the envelope reconciles away');
  ok(/adoptServerSlots/.test(mc),
    'BIND: src/multi-character.js exposes no adoptServerSlots seam, so the hr_state_of projection '
    + 'has no reader and G.heroSlotsUnlocked stays the authority — the b371 store a restore rewinds');
  const rec = await readFile(join(ROOT, 'src', 'net', 'accrue.js'), 'utf8');
  ok(/export function reconcileHeroSlots\(/.test(rec) && /hero_slots/.test(rec),
    'BIND: src/net/accrue.js does not reconcile the envelope\'s hero_slots — the projection would '
    + 'arrive on every envelope and nothing would read it');
}

/**
 * The guard, as a function, so tests/run-smoke.mjs can call it the way it calls
 * traitBuyGuard(). Returns the problem list; empty is green.
 */
export async function heroSlotBuyGuard() {
  problems.length = 0;
  const catalogue = grade(await run());
  await bindGuard(catalogue);
  return [...problems];
}

// ── main (only when run directly; run-smoke imports the guard above) ─────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/hero-slot-buy.mjs');
if (RUN_DIRECTLY) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(32)} ${m.why}`);
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
    console.error(`hero-slot-buy: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('hero-slot-buy: green — server-priced, ladder-ordered, debited once from the wallet '
    + 'the player can see, entitlement on the account row, idempotent on replay, already_owned '
    + 'refused, refusals not cached, grandfathered characters kept, the premium waiver expressed as '
    + 'ownership rather than a free price, the free-character mint closed, and the ladder bound to '
    + 'src/multi-character.js and src/data/shops.js in every direction.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
