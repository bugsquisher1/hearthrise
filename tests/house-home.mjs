#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/house-home.mjs — ONE HOME PER ACCOUNT (Tyler 2026-10-15), ON THE SERVER.
//
//   node tests/house-home.mjs             the guard
//   node tests/house-home.mjs --list      the mutation catalogue
//   node tests/house-home.mjs --selftest  every mutation must be CAUGHT
//   node tests/house-home.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-11-21-house-home.sql.
// Real RPCs on a fully replayed PGlite chain (production untouched):
//   H1  THE SECTION. A new account's `home` reads tier 0, the property ladder at
//       the catalogue's prices, every sellable room at level 0 with rung 1 next,
//       the same on both heroes.
//   H2  ONE PROPERTY. Slot 1 buys the first tier; slot 0 reads it as held, and
//       slot 0 buying it again is already_owned and charges nothing.
//   H3  ONE SET OF ROOMS. Slot 0 builds a room on the ACCOUNT's tier (its own row
//       holds none); slot 1's perk channel and section have it; slot 1 rung 1 is
//       already_owned and rung 2 builds (no rung_skipped).
//   H4  A PLOT STAYS THE CHARACTER'S: hr_unlock_levels on slot 0 never shows slot 1's plot.
//   H5  THE LOCK ORDER of hr_unlock_buy: character key -> home key -> the rung read.
//   H6  THE ACL: the home readers are server-only.
// TRUE CONCURRENCY is unverified locally (PGlite is one backend); H5 pins the
// order that makes it correct.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-11-21-house-home.sql';

/* The file's own §5 self-check would refuse every mutant at apply; it is blinded so the guard judges it. */
const GATE_BLIND = [
  ['  ver bigint;\nbegin\n', '  ver bigint;\nbegin\n  if true then return; end if;   -- selftest: §5 short-circuited\n'],
];
const BODY = {
  levels_per_character: {
    why: 'the engine seam reads one character: a room bought on one hero gives the others nothing (two homes)',
    find: "     and (pp.slot = p_slot or u.namespace in ('room', 'property'))\n",
    repl: '     and pp.slot = p_slot\n',
  },
  plot_account_wide: {
    why: 'a plot (a character\'s own) leaks to every hero of the account',
    find: "     and (pp.slot = p_slot or u.namespace in ('room', 'property'))\n",
    repl: "     and (pp.slot = p_slot or u.namespace in ('room', 'property', 'plot'))\n",
  },
  cur_per_character: {
    why: 'the held rung is read for the paying hero only: a second hero pays again for the same home',
    find: "     where user_id = v_uid and (slot = v_slot or v_cat.namespace in ('room', 'property'))\n",
    repl: '     where user_id = v_uid and slot = v_slot\n',
  },
  tier_per_character: {
    why: 'the property gate reads the paying hero only: a room the account\'s home opened is refused on the other heroes',
    find: '      v_tier := public.hr_account_property_tier(v_uid);\n',
    repl: "      select coalesce(max(pp.value), 0) into v_tier from public.player_progress pp join public.hr_unlocks u on u.unlock_id = pp.key and u.progress_kind = pp.kind where pp.user_id = v_uid and pp.slot = v_slot and pp.period_key = '' and u.namespace = 'property';\n",
  },
  home_unlocked: {
    why: 'the home purchase stops taking the account home lock: two heroes buying one rung both pay',
    find: "    perform pg_advisory_xact_lock(hashtextextended('hr:home:' || v_uid::text, 0));\n",
    repl: '    null;\n',
  },
  owned_lies: {
    why: 'the section never marks a tier held: the window offers the home the account already has',
    find: "'owned', o.value <= (select tier from t))",
    repl: "'owned', false)",
  },
  section_granted: {
    why: 'authenticated may call hr_home_view directly: any user reads any account\'s home',
    find: "revoke execute on function public.hr_home_view(uuid, int) from public, anon, authenticated, service_role;",
    repl: "revoke execute on function public.hr_home_view(uuid, int) from public, anon, service_role; grant execute on function public.hr_home_view(uuid, int) to authenticated;",
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

async function run(mutate) {
  problems.length = 0;
  const { db } = await bootReplay({ patches: mutate ? new Map([[MIG, patchList(mutate)]]) : undefined, upTo: MIG });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const as = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const gate = async () => { await q('delete from public.hr_rate_counters'); };

  const P1 = await one("select o.* from public.hr_unlock_offers o where o.unlock_id like 'property:%' and o.refusal is null order by o.value limit 1");
  const R1 = await one("select o.* from public.hr_unlock_offers o where o.unlock_id like 'room:%' and o.refusal is null and o.value = 1 and o.req_property_tier <= $1 and o.req_item is null order by o.offer_id limit 1", [P1.value]);
  const R2 = await one('select o.* from public.hr_unlock_offers o where o.unlock_id = $1 and o.value = 2', [R1.unlock_id]);
  const room = R1.unlock_id.slice(5);

  const u = (await one('select gen_random_uuid() as i')).i;
  await q('insert into auth.users (id) values ($1)', [u]);
  await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'house-home test')", [u]);
  await as(u);
  for (const s of [0, 1]) { await gate(); await q('select public.hr_create_character($1)', [s]); }
  const home = async (slot) => (await one("select public.hr_state_of($1,$2)->'home' h", [u, slot])).h;
  const goldOf = async (s) => Number((await one('select gold::text g from public.player_state where user_id=$1 and slot=$2', [u, s])).g);
  const setGold = (s, g) => q('update public.player_state set gold=$3 where user_id=$1 and slot=$2', [u, s, g]);
  const give = (s, items, n) => Promise.all(Object.entries(items || {}).map(([k, v]) =>
    q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1,$2,$3,$4) on conflict (user_id, slot, item_id) do update set qty = excluded.qty', [u, s, k, n ?? v])));
  const buy = async (s, offer) => {
    await as(u); await gate();
    const ver = (await one('select version from public.player_state where user_id=$1 and slot=$2', [u, s])).version;
    return (await one('select public.hr_unlock_buy($1,$2,$3,gen_random_uuid(),$4) v', [u, s, ver, offer])).v;
  };

  // H1 THE SECTION.
  const sellableRooms = Number((await one("select count(distinct unlock_id)::int n from public.hr_unlock_offers where unlock_id like 'room:%' and refusal is null")).n);
  const h0 = await home(0), h1 = await home(1);
  ok(h0 && h0.tier === 0 && h0.tiers.length >= 1 && h0.tiers[0].offer === P1.offer_id && Number(h0.tiers[0].gold) === Number(P1.gold) && h0.tiers[0].owned === false
     && h0.rooms.length === sellableRooms && h0.rooms.every((r) => r.level === 0 && r.next && r.next.rung === 1), `H1: a new account's home reads ${JSON.stringify(h0).slice(0, 400)}`);
  ok(JSON.stringify(h0) === JSON.stringify(h1), 'H1: the two heroes read different homes');

  // H2 ONE PROPERTY.
  await setGold(1, Number(P1.gold) + 5); await give(1, P1.items);
  let v = await buy(1, P1.offer_id);
  ok(v && v.ok === true && await goldOf(1) === 5, `H2: slot 1 buying ${P1.offer_id} answered ${JSON.stringify(v).slice(0, 200)}`);
  const hb = await home(0);
  ok(hb && hb.tier === P1.value && hb.tiers[0].owned === true, `H2: slot 0 reads the home as ${JSON.stringify(hb && { tier: hb.tier, t0: hb.tiers[0] })}`);
  await setGold(0, 10_000_000); await give(0, { ...P1.items, ...R1.items, ...R2.items }, 100000);
  v = await buy(0, P1.offer_id);
  ok(v && v.error === 'already_owned' && await goldOf(0) === 10_000_000, `H2: slot 0 re-buying the home answered ${JSON.stringify(v).slice(0, 200)}`);

  // H3 ONE SET OF ROOMS.
  v = await buy(0, R1.offer_id);
  ok(v && v.ok === true && await goldOf(0) === 10_000_000 - Number(R1.gold), `H3: slot 0 building ${R1.offer_id} answered ${JSON.stringify(v).slice(0, 200)}`);
  const perks1 = (await one('select public.hr_perks_of($1,1) p', [u])).p;
  ok(perks1 && perks1.rooms && Number(perks1.rooms[room]) === 1, `H3: slot 1's perk channel reads rooms ${JSON.stringify(perks1 && perks1.rooms)}`);
  const hr1 = await home(1);
  const rr = hr1 && hr1.rooms.find((r) => r.room === room);
  ok(rr && rr.level === 1 && rr.next && rr.next.offer === R2.offer_id, `H3: slot 1's section reads ${JSON.stringify(rr)}`);
  await setGold(1, 10_000_000); await give(1, { ...R1.items, ...R2.items }, 100000);
  v = await buy(1, R1.offer_id);
  ok(v && v.error === 'already_owned' && await goldOf(1) === 10_000_000, `H3: slot 1 re-buying rung 1 answered ${JSON.stringify(v).slice(0, 200)}`);
  v = await buy(1, R2.offer_id);
  ok(v && v.ok === true, `H3: slot 1 building rung 2 answered ${JSON.stringify(v).slice(0, 200)}`);
  const lv0 = await one('select level from public.hr_unlock_levels($1,0) where unlock_id=$2', [u, R1.unlock_id]);
  ok(lv0 && lv0.level === 2, `H3: slot 0 reads rung ${lv0 && lv0.level}, expected 2`);

  // H4 A PLOT STAYS THE CHARACTER'S.
  const plot = await one("select unlock_id, progress_kind, coalesce(rungs[1], 1) as v from public.hr_unlocks where namespace = 'plot' and merge <> 'none' order by unlock_id limit 1");
  if (plot) {
    await q("insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at) values ($1, 1, $2, $3, $4, '', null, now())", [u, plot.progress_kind, plot.unlock_id, plot.v]);
    const p0 = await one('select count(*)::int n from public.hr_unlock_levels($1,0) where unlock_id=$2', [u, plot.unlock_id]);
    const p1 = await one('select count(*)::int n from public.hr_unlock_levels($1,1) where unlock_id=$2', [u, plot.unlock_id]);
    ok(p0.n === 0 && p1.n === 1, `H4: the plot reads on slot 0 ${p0.n}, slot 1 ${p1.n}`);
  } else ok(false, 'H4: the catalogue has no plot unlock to probe');

  // H5 THE LOCK ORDER.
  const src = (await one("select prosrc from pg_proc where oid = to_regprocedure('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)')")).prosrc.replace(/--[^\n]*/g, '');
  const iChar = src.indexOf("hashtextextended(v_uid::text || ':' || v_slot::text, 0)");
  const iHome = src.indexOf("hashtextextended('hr:home:' || v_uid::text, 0)");
  const iCur = src.indexOf('select max(value) into v_cur');
  ok(iChar > 0 && iHome > iChar && iCur > iHome, `H5: hr_unlock_buy lock order char ${iChar} -> home ${iHome} -> rung read ${iCur}`);

  // H6 THE ACL.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const f of ['hr_home_view(uuid,integer)', 'hr_unlock_levels(uuid,integer)']) {
      ok(!(await one(`select has_function_privilege('${role}','public.${f}','execute') e`)).e, `H6: ${role} reaches ${f}`);
    }
  }
  await db.close?.();
  return [...problems];
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--list')) { for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}`); process.exit(0); }
  const oneArg = argv.find((a) => a.startsWith('--mutate='));
  if (argv.includes('--selftest') || oneArg) {
    const ids = oneArg ? [oneArg.slice('--mutate='.length)] : Object.keys(MUTATIONS);
    let slipped = 0;
    for (const id of ids) {
      let caught;
      try { const p = await run(id); caught = p.length ? p[0] : null; }
      catch (e) { if (e.harness) throw e; caught = 'refused at apply: ' + String(e.message).split('\n')[0].slice(0, 160); }
      if (caught) console.log(`  CAUGHT  ${id}: ${caught}`);
      else { slipped++; console.log(`  SLIPPED ${id}: ${MUTATIONS[id].why}`); }
    }
    console.log(slipped ? `house-home --selftest: ${slipped} mutation(s) SLIPPED` : `house-home --selftest: all ${ids.length} mutations caught`);
    process.exit(slipped ? 1 : 0);
  }
  const p = await run(null);
  if (p.length) { console.log('house-home: RED\n  ' + p.join('\n  ')); process.exit(1); }
  console.log('house-home: one home per account (H1-H6 green): the section is the catalogue\'s, a property and a room bought on one hero are every hero\'s and never bought twice, a plot stays the character\'s, lock order pinned, readers server-only');
  process.exit(0);
} catch (e) {
  console.error(`house-home: HARNESS ERROR — ${e.message}`);
  process.exit(2);
}
