#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/perk-channel.mjs — the PERMANENT PERK CHANNEL, end to end, EXECUTED.
//
// THE CLAIM UNDER TEST, in one line: an unlock row written to the database
// reaches `burnChance` in the accrual engine with the same magnitude the
// player's own client computes, and nothing else does.
//
// Every step of that chain runs for real:
//   player_progress row        (real table, real migration)
//     → public.hr_unlock_levels  (the seam, real SQL)
//     → public.hr_perks_of       (real SECURITY DEFINER function)
//     → normalisePerkState       (real src/core/perks.js)
//     → makeBonus('noBurn')      (real, shared with the client)
//     → burnChance()             (real src/core/artisan.js)
//
// PostgreSQL is real too — PGlite/WASM, PG 18, in process, with the migration
// files applied verbatim. The only scaffolding is tests/sql/pglite-fixture.sql
// (auth.uid, auth.users, profiles, the pg_cron shim, the four Supabase roles),
// which the rest of the SQL suite already uses.
//
// ── WHY THE PARITY HALF IS THE POINT ────────────────────────────────────
// A test that fed one perk state into one function and asserted the answer
// would prove nothing about drift — both sides would be the same call. The
// parity block instead starts from ONE SAVE and travels the two REAL
// adapters:
//
//   G (a save)  --clientPerkState()-->   permanentBonus()   -->  number
//   G (a save)  --unlock rows--> hr_perks_of --> normalise --> number
//
// The adapters are where drift actually lives — that is exactly how the
// client came to pay two Scarecrows and the shops catalogue to grant
// `plot:scarecrow` twice while a naive server read would have paid one.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/perk-channel.mjs --mutate
// plants six real defects, one at a time, and FAILS if any of them slips
// past. A guard that has never been shown to see failure is decoration; this
// repo is at instance #15 of that family.
//
// Run standalone:  node tests/perk-channel.mjs
// Also invoked as a preflight by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ROOM_PERKS, PLOT_PERKS, CAPSTONE_PERKS, CASTLE_TIER,
  EMPTY_PERKS, PERMANENT_CAP, GOVERNED,
  normalisePerkState, permanentBonus, makeBonus, clampPermanent, restedPayload,
} from '../src/core/perks.js';
import { burnChance, BURN_BASE } from '../src/core/artisan.js';
import { zeroBonus, bonusFor, computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { xpForLevel } from '../src/core/xp.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

/* Apply order. perk-channel needs player_state (the table + hr_create_character)
   and nothing else structural; the catalogue/budget/apply-engine trio rides
   along because hr_create_character's start kit reads the catalogue, and
   because a guard that applies a DIFFERENT subset from the real chain is
   testing a database nobody will ever run. */
const MIGRATIONS = [
  ['player-state', MIG('2026-08-11-player-state.sql')],
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['perk-channel', MIG('2026-08-15-perk-channel.sql')],
];

const USER = '00000000-0000-4000-b000-9e9e9e9e9e9e';

let problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

async function boot(patch) {
  let PGlite;
  /* THROW, never process.exit(): this guard is imported by run-smoke.mjs, and
     a guard that cannot run must fail as ONE guard rather than decide the
     outcome of the other 700. Deliberately not a silent skip — an unrunnable
     guard that reports success is the always-null probe. */
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    throw new Error(
      '@electric-sql/pglite is not installed, so the perk channel guard could not run. It '
      + 'exercises a real PostgreSQL in process; without it a "pass" would assert nothing. '
      + 'Install it:  npm i -D @electric-sql/pglite');
  }
  const db = await PGlite.create();
  await db.exec(await readFile(join(ROOT, 'tests', 'sql', 'pglite-fixture.sql'), 'utf8'));
  /* hr_utc_day_key is a PRE-EXISTING production object (2026-08-08-clan-seat.sql)
     that daily-budget fails closed without. Lifted by its EXACT BYTES so there
     is never a second definition of "what a UTC day is" in the tree. */
  const seat = await readFile(MIG('2026-08-08-clan-seat.sql'), 'utf8');
  const dayKey = seat.match(/create or replace function public\.hr_utc_day_key[\s\S]*?\$\$;/);
  if (!dayKey) throw new Error('could not lift hr_utc_day_key out of 2026-08-08-clan-seat.sql');
  await db.exec(dayKey[0]);
  await db.exec(`revoke execute on function public.hr_utc_day_key(timestamptz)
                   from public, anon, authenticated, service_role`);
  for (const [name, path] of MIGRATIONS) {
    let sql = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
    if (patch) sql = patch(name, sql);
    await db.exec(sql);
  }
  /* Our own identity. The fixture seeds ONE user id and the SQL suite shares
     it; this guard uses a distinct one so a leaked row from another guard
     could never be mistaken for this one's. */
  await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [USER]);
  return db;
}

async function asPlayer(db, sql, params = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER]);
  const r = await db.query(sql, params);
  return r.rows[0];
}

const perksOf = (db, slot = 0) =>
  db.query('select public.hr_perks_of($1::uuid,$2::int) as p', [USER, slot])
    .then((r) => r.rows[0].p);

/* Write unlock rows the way a future unlock intent will: one `flag` row per
   unlock id, holding the RESOLVED value. Deliberately a plain INSERT and not
   an RPC — no unlock intent exists yet, and inventing one here would be this
   test asserting about a function nobody wrote. */
async function grantUnlocks(db, rows, slot = 0) {
  for (const [key, value] of Object.entries(rows)) {
    await db.query(
      `insert into public.player_progress (user_id, slot, kind, key, value)
       values ($1,$2,'flag',$3,$4)
       on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`,
      [USER, slot, key, value]);
  }
}

/* ── THE CLIENT ADAPTER, as src/legacy.js clientPerkState() writes it ─────
   Restated here rather than imported because legacy.js is a classic script
   Node cannot import. That is a second copy and it is guarded: mutation M6
   below breaks the plot COUNT the way a `{id:true}` shape would, and the
   parity block goes red. The browser runs the real one — src/features/
   smoke-test.js B349-2 drives `window.clientPerkState` itself. */
function clientPerkStateFromSave(G) {
  const plots = {};
  (G.plotBuildings || []).forEach((b) => { if (b && b.id) plots[b.id] = (plots[b.id] || 0) + 1; });
  return {
    rooms: G.rooms || {},
    plots,
    propertyTier: (G.homestead && G.homestead.tier) || 0,
    renownAllXp: G.renownAllXp || 0,
    clanPerks: {},
    castle: null,
  };
}

/* The same save, expressed as unlock rows — the shape a shop purchase will
   write. Rooms and property are ABSOLUTE (the rung/tier); plot buildings are
   REPEATABLE, so the row holds the COUNT. */
function unlockRowsFromSave(G) {
  const rows = {};
  for (const [id, lv] of Object.entries(G.rooms || {})) if (lv > 0) rows[`room:${id}`] = lv;
  const counts = {};
  (G.plotBuildings || []).forEach((b) => { if (b && b.id) counts[b.id] = (counts[b.id] || 0) + 1; });
  for (const [id, n] of Object.entries(counts)) rows[`plot:${id}`] = n;
  const tier = (G.homestead && G.homestead.tier) || 0;
  if (tier > 0) rows[`property:tier${tier}`] = tier;
  return rows;
}

/* Every key that can carry a permanent bonus — the union of the room table's
   keys and the plot/capstone keys. Read from the DATA, never listed by hand:
   a hand-written list cannot notice a new key, which is the whole class of
   bug this file is a response to. */
const ALL_KEYS = [...new Set([
  ...Object.values(ROOM_PERKS).flatMap((l) => l.flatMap((m) => Object.keys(m))),
  ...Object.values(PLOT_PERKS).flatMap((m) => Object.keys(m)),
  ...Object.keys(CAPSTONE_PERKS),
  ...Object.keys(GOVERNED),
])].sort();

// ════════════════════════════════════════════════════════════════════════
async function run(patch) {
  const db = await boot(patch);

  const created = await asPlayer(db, 'select public.hr_create_character(0) as r');
  ok(created.r?.ok === true || created.r?.created === true,
    `SETUP: hr_create_character failed — ${JSON.stringify(created.r)}`);

  // ── P1 · THE DEGRADE PATH IS GENUINELY INERT ──────────────────────────
  // The design rests on "no unlock rows ⇒ behaves exactly as zeroBonus did".
  // That is a claim about executable behaviour, so it is executed rather than
  // asserted in a comment.
  {
    const fresh = await perksOf(db);
    ok(fresh?.ok === true, `P1: a fresh character returned ${JSON.stringify(fresh)}`);
    const b = makeBonus(fresh);
    const bad = ALL_KEYS.filter((k) => b(k) !== zeroBonus(k));
    ok(bad.length === 0, `P1: makeBonus(fresh) differs from zeroBonus on ${bad.join(', ')}`);
    const bEmpty = bonusFor(null);
    ok(ALL_KEYS.every((k) => bEmpty(k) === 0),
      'P1: bonusFor(null) is not inert — a database with no perk channel would not degrade');
    ok(burnChance({ req: 10 }, 10, b('noBurn')) === BURN_BASE,
      'P1: a perkless character does not burn at the base rate');
  }

  // ── P2 · THE ONE THAT BLOCKS ARTISAN: noBurn, rung by rung ────────────
  // Measured expectations, from src/core/artisan.js: BURN_BASE 0.25 minus the
  // Kitchen's noBurn, at the recipe's REQUIRED level (no mastery relief).
  const KITCHEN_BURN = [
    [0, 0.25],   // no Kitchen — what the server does today
    [1, 0.12],
    [2, 0.06],
    [3, 0.00],
    [4, 0.00],
    [5, 0.00],
  ];
  for (const [rung, expected] of KITCHEN_BURN) {
    await db.query('delete from public.player_progress where user_id=$1', [USER]);
    if (rung > 0) await grantUnlocks(db, { 'room:kitchen': rung });
    const env = await perksOf(db);
    const b = makeBonus(env);
    const got = burnChance({ req: 10 }, 10, b('noBurn'));
    ok(near(got, expected),
      `P2: Kitchen ${rung} burns at ${got} — expected ${expected}. The server would ${
        got > expected ? 'DESTROY' : 'wrongly protect'} input the client would not.`);
  }

  // ── P3 · THE ROUND TRIP CARRIES EVERY ROOM, AT EVERY RUNG ─────────────
  // Not just the Kitchen. A seam that special-cased one prefix would pass P2.
  {
    await db.query('delete from public.player_progress where user_id=$1', [USER]);
    const all = {};
    for (const id of Object.keys(ROOM_PERKS)) all[`room:${id}`] = ROOM_PERKS[id].length;
    await grantUnlocks(db, all);
    const env = await perksOf(db);
    const state = normalisePerkState(env);
    const missing = Object.keys(ROOM_PERKS).filter(
      (id) => state.rooms[id] !== ROOM_PERKS[id].length);
    ok(missing.length === 0, `P3: rooms lost in the round trip: ${missing.join(', ')}`);
    // And the top rung of every room actually pays.
    for (const id of Object.keys(ROOM_PERKS)) {
      const top = ROOM_PERKS[id][ROOM_PERKS[id].length - 1];
      for (const k of Object.keys(top)) {
        ok(permanentBonus(k, state) >= top[k] - 1e-9,
          `P3: ${id} at its top rung pays ${permanentBonus(k, state)} of ${k}, expected >= ${top[k]}`);
      }
    }
  }

  // ── P4 · PARITY: ONE SAVE, TWO REAL ADAPTERS ──────────────────────────
  // The block this file exists for. Six saves, each chosen because it breaks
  // a different naive implementation.
  const SAVES = [
    { name: 'empty', G: { rooms: {}, plotBuildings: [], homestead: { tier: 0 } } },
    { name: 'kitchen-3 + toolshed',
      G: { rooms: { kitchen: 3 }, plotBuildings: [{ id: 'toolshed' }], homestead: { tier: 2 } } },
    // TWO Scarecrows. `{scarecrow:true}` pays +1; the truth is +2.
    { name: 'two scarecrows',
      G: { rooms: {}, plotBuildings: [{ id: 'scarecrow' }, { id: 'scarecrow' }],
           homestead: { tier: 1 } } },
    // The capstone, at exactly the tier that grants it.
    { name: 'castle capstone',
      G: { rooms: { library: 5 }, plotBuildings: [], homestead: { tier: CASTLE_TIER } } },
    // One tier BELOW the capstone — the off-by-one that would hand every Keep
    // owner a free +2% allXP.
    { name: 'keep, no capstone',
      G: { rooms: { library: 5 }, plotBuildings: [], homestead: { tier: CASTLE_TIER - 1 } } },
    { name: 'everything',
      G: { rooms: Object.fromEntries(Object.keys(ROOM_PERKS).map((id) => [id, 5])),
           plotBuildings: [{ id: 'toolshed' }, { id: 'watchtower' },
                           { id: 'scarecrow' }, { id: 'scarecrow' },
                           { id: 'farm_plot' }, { id: 'farm_plot' }],
           homestead: { tier: CASTLE_TIER } } },
  ];
  for (const { name, G } of SAVES) {
    await db.query('delete from public.player_progress where user_id=$1', [USER]);
    await grantUnlocks(db, unlockRowsFromSave(G));
    const serverState = normalisePerkState(await perksOf(db));
    const clientState = normalisePerkState(clientPerkStateFromSave(G));
    for (const k of ALL_KEYS) {
      const c = permanentBonus(k, clientState);
      const s = permanentBonus(k, serverState);
      ok(near(c, s), `P4 [${name}]: ${k} — client ${c}, server ${s}. The two adapters disagree.`);
    }
  }

  // ── P5 · A HOSTILE PERK STATE CANNOT NAME A NUMBER ────────────────────
  // The security property, executed. `normalisePerkState` takes ids and
  // counts; every magnitude comes from the generated table. So the worst a
  // forged envelope can claim is a room the player has not built — which is a
  // claim only the database produces.
  {
    const hostile = normalisePerkState({
      rooms: { kitchen: 99, __proto__: 5, constructor: 9, notARoom: 5 },
      plots: { toolshed: 1e9, notAPlot: 50 },
      propertyTier: 9999,
      renownAllXp: 999,
      clanPerks: { allXP: 999, gatherSpeed: -5 },
    });
    ok(hostile.rooms.kitchen === ROOM_PERKS.kitchen.length,
      `P5: a rung of 99 was not clamped to the ladder (${hostile.rooms.kitchen})`);
    ok(!('notARoom' in hostile.rooms) && !('notAPlot' in hostile.plots),
      'P5: an unknown id survived normalisation');
    ok(!('constructor' in hostile.rooms),
      'P5: `constructor` survived — ROOM_PERKS[id] truthiness would have accepted it');
    ok(hostile.renownAllXp <= PERMANENT_CAP,
      `P5: renownAllXp ${hostile.renownAllXp} exceeds the permanent fuse`);
    for (const k of ALL_KEYS) {
      if (!GOVERNED[k]) continue;
      ok(makeBonus(hostile)(k) <= PERMANENT_CAP + 1e-9,
        `P5: ${k} reached ${makeBonus(hostile)(k)} — above the ${PERMANENT_CAP} permanent fuse`);
    }
    // The Kitchen's 99 still pays its REAL top rung, not nothing — a clamp
    // that zeroed would be a denial of service wearing a fuse's clothes.
    ok(near(makeBonus(hostile)('noBurn'), ROOM_PERKS.kitchen[4].noBurn),
      'P5 CONTROL: the clamped rung stopped paying at all');
  }

  // ── P6 · THE FUSE IS A CEILING ON GAIN, NOT A FLOOR ON LOSS ───────────
  {
    ok(clampPermanent('allXP', 0.9) === PERMANENT_CAP, 'P6: the fuse does not bind');
    ok(clampPermanent('allXP', -0.5) === -0.5, 'P6: the fuse turned a debuff into a buff');
    ok(clampPermanent('noBurn', 0.9) === 0.9, 'P6: an ungoverned key was clamped');
    ok(clampPermanent('farmYield', 8) === 8, 'P6: farmYield (a COUNT) was clamped as a rate');
  }

  // ── P7 · THE SEAM AND THE FUNCTION ARE NOT CLIENT-REACHABLE ───────────
  // §4(a) of the migration asserts this at apply time; asserting it again
  // here means a LATER migration that re-granted it fails this suite too.
  {
    const acl = await db.query(`
      select has_function_privilege('authenticated', p.oid, 'execute') as auth_can,
             has_function_privilege('anon', p.oid, 'execute')          as anon_can,
             has_function_privilege('hr_engine', p.oid, 'execute')     as eng_can,
             p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname in ('hr_perks_of','hr_unlock_levels')`);
    ok(acl.rows.length === 2, `P7: expected 2 functions, found ${acl.rows.length}`);
    for (const r of acl.rows) {
      ok(r.auth_can === false, `P7: ${r.proname} is executable by authenticated`);
      ok(r.anon_can === false, `P7: ${r.proname} is executable by anon`);
    }
    ok(acl.rows.find((r) => r.proname === 'hr_perks_of').eng_can === true,
      'P7: hr_perks_of is NOT executable by hr_engine — every night would price at zero perks');
    ok(acl.rows.find((r) => r.proname === 'hr_unlock_levels').eng_can === false,
      'P7: hr_unlock_levels is executable by hr_engine — a second, unfiltered read path');
    const grants = await db.query(
      `select count(*)::int n from information_schema.role_table_grants
        where grantee='hr_engine' and table_schema='public'`);
    ok(grants.rows[0].n === 0, `P7: hr_engine holds ${grants.rows[0].n} table grants`);
  }

  // ── P8 · THE LIBRARY'S RESTED PAYLOAD SURVIVES THE LADDER SCAN ────────
  // L5 carries both fields, L4 only `rested`. A forward scan would leave an
  // L5 player without `restedCap`.
  {
    ok(restedPayload({ rooms: { library: 3 } }).rested === 0, 'P8: L3 pays a Rested quantum');
    ok(restedPayload({ rooms: { library: 4 } }).rested === 800, 'P8: L4 Rested quantum wrong');
    const l5 = restedPayload({ rooms: { library: 5 } });
    ok(l5.rested === 1600 && l5.restedCap === 120,
      `P8: L5 reads ${JSON.stringify(l5)} — expected 1600 / 120`);
  }

  // ── P9 · THE UNDER-PAY IS ACTUALLY CLOSED, MEASURED ───────────────────
  // Everything above proves the perk state REACHES the engine's bonus
  // function. This proves the engine SPENDS it: the same 12h absence, the
  // same seed, the same equipment, varying ONLY the perk state.
  //
  // Without it the whole change could be inert and every other block would
  // still be green — `computeAccrual` could build `bonus` and pass
  // `zeroBonus` to simulateSpan, and nothing else here would notice. That is
  // the always-null probe with the parts reversed.
  {
    const base = {
      userId: '00000000-0000-4000-8000-00000000b349',
      slot: 0,
      nowMs: Date.UTC(2026, 2, 15, 12, 0, 0),
      accruedToMs: Date.UTC(2026, 2, 15, 0, 0, 0),
      activeSinceMs: Date.UTC(2026, 2, 15, 0, 0, 0),
      activeKind: 'combat',
      /* THE WEAKEST MONSTER IN THE CATALOGUE, derived — never a hand-typed id,
         so a rename cannot turn this block into a silent `unknown_monster`
         skip that reports green. Derived by the PROPERTY that matters rather
         than by name: the first draft took `Object.keys().sort()[0]`, which is
         `ancient_bear`, and a level-1 character died at once — 0 kills, 2 XP,
         and a perk lift of exactly 0% that read as "the engine ignores perks".
         A fixture chosen by alphabetical order is a fixture chosen at random. */
      activeId: Object.keys(MONSTERS).sort(
        (a, b) => (MONSTERS[a].hp || 0) - (MONSTERS[b].hp || 0) || a.localeCompare(b))[0],
      capMs: 12 * 3600000,
      seed: 0x5eed1234,
      /* A MAXED CHARACTER, so the night is not truncated by a death. The
         bare level-1 fixture dies at 314s against a Slime — that is the live
         P0 the Field Licence exists for, and a night that ends in five
         minutes cannot measure a RATE bonus. Verified: `summary.died` is
         false here and `survivedMs` is the full span. */
      hp: 990, maxHp: 990, gold: 0,
      skills: {
        attack: xpForLevel(99), strength: xpForLevel(99),
        defense: xpForLevel(99), hitpoints: xpForLevel(99),
      },
      equipment: {}, inventory: {},
      items: ITEMS, monsters: MONSTERS, nodes: {},
    };
    const none = computeAccrual({ ...base, perks: null });
    /* Trophy Room L5 (+5% combatXP) + a Watchtower (+2%) = +7% combat XP.
       Library L5 (+5% allXP) + the capstone (+2%) = +7% on everything. */
    const decked = computeAccrual({
      ...base,
      perks: {
        ok: true,
        rooms: { trophy: 5, library: 5 },
        plots: { watchtower: 1 },
        propertyTier: CASTLE_TIER,
      },
    });
    ok(none.accrued === true && decked.accrued === true,
      `P9: a fixture did not accrue (${none.reason} / ${decked.reason}) — the block asserts nothing`);
    ok(none.summary && none.summary.died === false,
      'P9: the bare fixture DIED, so the night is truncated and no rate bonus is measurable here');
    if (none.accrued && decked.accrued) {
      const sum = (x) => Object.values(x.delta.xp || {}).reduce((a, b) => a + b, 0);
      const a = sum(none);
      const b = sum(decked);
      ok(b > a,
        `P9: a decorated character was paid ${b} XP against a bare one's ${a} — the perk state reaches `
        + 'the bonus function and the engine does not spend it');
      /* MEASURED 2026-08-15: 651,398 -> 758,572 XP, +16.45%, 14,097 kills,
         same seed, same equipment, varying only the perk state.
         The naive expectation is +14% (Trophy L5 + Watchtower = +7% combatXP,
         Library L5 + capstone = +7% allXP, both applying to combat skills).
         It measures HIGHER, and the reason is worth recording rather than
         widening the band around: `grantXp` FLOORS each grant, so on a
         low-XP monster a percentage bonus is worth more than its headline —
         floor(1.95) is 1 and floor(1.95 x 1.14) is 2. A Slime's 5 base XP is
         the extreme of that. The band is set from the measurement with room
         for the fight to diverge, not from the arithmetic. */
      const lift = a > 0 ? (b - a) / a : 0;
      ok(lift > 0.10 && lift < 0.25,
        `P9: the perk lift is ${(lift * 100).toFixed(1)}% (${a} -> ${b} XP). Trophy L5 + Watchtower `
        + '(+7% combatXP) and Library L5 + capstone (+7% allXP) measured +16.45% on this fixture.');
      /* SHAPE, immune to the flooring: a bigger grant must pay more than a
         smaller one. If the channel were paying a constant, both would match. */
      const only = (p) => sum(computeAccrual({ ...base, perks: { ok: true, plots: {}, propertyTier: 0, ...p } }));
      const big = only({ rooms: { trophy: 5 } });        // +5% combatXP
      const small = only({ rooms: { trophy: 2 } });      // +2% combatXP
      ok(big > small && small > a,
        `P9: rung 5 paid ${big}, rung 2 paid ${small}, none paid ${a} — the ladder is not monotone, `
        + 'so the channel is forwarding a constant rather than the rung');
      console.log(`  perk lift on a 12h ${base.activeId} night: ${a} -> ${b} XP `
        + `(+${(lift * 100).toFixed(1)}%), ${none.summary.kills} -> ${decked.summary.kills} kills; `
        + `Trophy rung 2 ${small} < rung 5 ${big}`);
    }
    /* CONTROL: an EMPTY perk envelope pays exactly what `perks: null` pays.
       This is the degrade path measured on the real engine rather than on
       makeBonus alone — a database with the channel installed but no unlocks
       written must be indistinguishable from one without the channel. */
    const emptyEnv = computeAccrual({
      ...base, perks: { ok: true, rooms: {}, plots: {}, propertyTier: 0 },
    });
    ok(JSON.stringify(emptyEnv.delta) === JSON.stringify(none.delta),
      'P9 CONTROL: an empty perk envelope paid differently from no envelope at all — the degrade '
      + 'path is not inert, so applying the migration would change every night before a single '
      + 'unlock exists');
  }

  await db.close?.();
}

// ════════════════════════════════════════════════════════════════════════
// MUTATION — prove every block above can go red.
//
// Each mutation is a REAL defect: the SQL or the adapter is genuinely changed
// and the whole suite re-run. If a mutation passes, the block that should
// have caught it is decoration, and THAT is the failure this mode reports.
const MUTATIONS = [
  {
    name: 'M1 seam drops the room prefix (only plots survive)',
    patch: (name, sql) => (name !== 'perk-channel' ? sql
      : sql.replace("and (pp.key like 'room:%' or pp.key like 'plot:%' or pp.key like 'property:%')",
                    "and (pp.key like 'plot:%' or pp.key like 'property:%')")),
  },
  {
    name: 'M2 hr_perks_of returns rooms empty (the zeroBonus regression)',
    patch: (name, sql) => (name !== 'perk-channel' ? sql
      : sql.replace("'rooms', coalesce(v_rooms, '{}'::jsonb),", "'rooms', '{}'::jsonb,")),
  },
  {
    name: 'M3 propertyTier takes the FIRST property row, not the max',
    patch: (name, sql) => (name !== 'perk-channel' ? sql
      : sql.replace("coalesce(max(u.level) filter (where u.unlock_id like 'property:%'), 0)",
                    "coalesce(min(u.level) filter (where u.unlock_id like 'property:%'), 0)")),
  },
  {
    name: 'M4 the seam forwards level-0 unlocks',
    patch: (name, sql) => (name !== 'perk-channel' ? sql
      : sql.replace('and pp.value   > 0', 'and pp.value   >= 0')),
  },
  {
    name: 'M5 hr_perks_of is granted to authenticated',
    patch: (name, sql) => (name !== 'perk-channel' ? sql
      : sql.replace('grant execute on function public.hr_perks_of(uuid, int) to hr_engine;',
                    'grant execute on function public.hr_perks_of(uuid, int) to hr_engine, authenticated;')),
  },
  {
    name: 'M6 the client adapter counts plots per ID, not per instance',
    adapter: true,
  },
];

async function mutate() {
  const escapes = [];
  for (const m of MUTATIONS) {
    problems = [];
    let saved = null;
    if (m.adapter) {
      /* The one mutation that is not SQL. Swap the client adapter for the
         `{id:true}` shape a naive implementation would write, which pays one
         Scarecrow instead of two. Restored in `finally`. */
      saved = clientPerkStateFromSave;
      // eslint-disable-next-line no-func-assign
      clientPerkStateFromSave = (G) => {
        const plots = {};
        (G.plotBuildings || []).forEach((b) => { if (b && b.id) plots[b.id] = 1; });
        return {
          rooms: G.rooms || {}, plots,
          propertyTier: (G.homestead && G.homestead.tier) || 0,
          renownAllXp: G.renownAllXp || 0, clanPerks: {}, castle: null,
        };
      };
    }
    try {
      await run(m.patch);
    } catch (e) {
      /* A mutation that makes the MIGRATION refuse to install is the migration
         defending itself — that counts as caught, and loudly. */
      problems.push(`migration refused: ${e?.message || e}`);
    } finally {
      // eslint-disable-next-line no-func-assign
      if (saved) clientPerkStateFromSave = saved;
    }
    const caught = problems.length > 0;
    console.log(`  ${caught ? 'RED  ' : 'GREEN'}  ${m.name}${caught ? ` (${problems.length})` : ''}`);
    if (caught) console.log(`         first: ${problems[0]}`);
    else escapes.push(m.name);
  }
  problems = escapes.map((n) => `MUTATION ESCAPED — the guard did not see: ${n}`);
  return escapes.length === 0;
}

export async function perkChannelGuard() {
  problems = [];
  try { await run(null); }
  catch (e) { problems.push(`perk channel guard failed to run — ${e?.message || e}`); }
  return problems.slice();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--mutate')) {
    console.log('perk channel — mutation run (every line must read RED):');
    const clean = await mutate();
    if (!clean) { for (const p of problems) console.log('  x ' + p); process.exit(1); }
    console.log(`All ${MUTATIONS.length} planted defects were caught.`);
    process.exit(0);
  }
  const ps = await perkChannelGuard();
  if (ps.length) {
    console.log('perk channel guard — FAILED:');
    for (const p of ps) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('Perk channel guard — an unlock row reaches burnChance with the client\'s own '
    + 'magnitude; the degrade path is inert; a forged state cannot name a number.');
}
