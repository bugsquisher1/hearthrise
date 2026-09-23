#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-analyzer.mjs — EVERY FIELD IS A SUM OVER ROWS THE SERVER WROTE.
//
//   node tests/hunt-analyzer.mjs             # the guard
//   node tests/hunt-analyzer.mjs --list      # the mutation catalogue
//   node tests/hunt-analyzer.mjs --selftest  # every mutation must be CAUGHT
//   node tests/hunt-analyzer.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-22-hunt-analyzer.sql
//
// ── WHAT THIS PROVES ────────────────────────────────────────────────────
// A REAL character on a fully replayed PGlite chain (real PostgreSQL, in
// process) is given a hunt and a set of FIXTURE LEDGER ROWS written through the
// REAL hr_apply. Every field hr_hunt_analyzer returns is then compared against
// a sum computed HERE, in JavaScript, from those same fixtures — not against
// another SQL query, which would be the same arithmetic asked twice.
//
// ── WHY THERE IS NO COUNTER TABLE TO TEST ───────────────────────────────
// docs/design/HUNTS_AND_ANALYZER.md §3: a per-hunt counter table is a second
// copy of what the ledger already says, it needs a reset on every way a hunt
// can start, and it can disagree with the journal — which is "the browser says
// one thing, the server says another" (CLAUDE.md §6) in a new costume. A3 is
// the arm that proves the absence pays off: restarting a hunt forgets the
// previous night WITHOUT deleting a single journal row.
//
// ── THE NUMBERS A PLAYER OPTIMISES AGAINST ──────────────────────────────
// Loot is priced from hr_items.value — the SEALED CATALOGUE, never a market
// price, because a player-influenced number inside a rate people optimise
// against invites wash trading to inflate a leaderboard-adjacent readout.
// Profit/h divides by ELAPSED, not paid: a hunt that pays well while swinging
// and spends half its night knocked out is not profitable, and the number used
// to choose a spawn must not hide that.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-09-22-hunt-analyzer.sql';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const MUTATIONS = {
  trusts_client_kills: 'Sum a client-authored meta key instead of the server-written one.',
  loot_counts_supplies: 'Count the NEGATIVE side of the item map as loot (the night\'s burn becomes profit).',
  xp_ignores_skill_cat: 'Drop the hr_skills.cat=combat filter so a cooking level inflates the combat rate.',
  profit_over_paid: 'Divide profit by PAID time instead of ELAPSED (design §3 note 3).',
  boundary_leaks_previous_hunt: 'Use >= the window floor so a window credited at the restart leaks in.',
  analyzer_unbounded_scan: 'Drop the 24-hour floor so the scan runs to active_since again — up to ~130,000 ledger rows on every envelope (A-1).',
};

const patchesFor = (mutate) => {
  switch (mutate) {
    case 'trusts_client_kills':
      return new Map([[MIG, [[
        "         coalesce(sum(coalesce((l.meta->>'kills')::bigint, 0)), 0),",
        "         coalesce(sum(coalesce((l.meta->>'client_kills')::bigint, (l.meta->>'kills')::bigint, 0)), 0),",
      ]]]]);
    case 'loot_counts_supplies':
      /* ANCHOR MOVED 2026-09-22 with finding A-1: the item map's two signs are
         now a LEFT JOIN LATERAL on the one scan rather than a pass of their
         own. Same expression, same deletion of the sign test. */
      return new Map([[MIG, [[
        '      select coalesce(sum(case when q.qty > 0 then q.qty * coalesce(i.value, 0) else 0 end), 0) as loot,',
        '      select coalesce(sum(abs(q.qty) * coalesce(i.value, 0)), 0) as loot,',
      ]]]]);
    case 'xp_ignores_skill_cat':
      return new Map([[MIG, [[
        "    join public.hr_skills s on s.skill_id = e.skill_id and s.cat = 'combat'",
        '    join public.hr_skills s on s.skill_id = e.skill_id',
      ]]]]);
    case 'profit_over_paid':
      return new Map([[MIG, [[
        "    'profit_per_h',  case when v_h_elapsed > 0 then round(v_profit/ v_h_elapsed) end,",
        "    'profit_per_h',  case when v_h_paid > 0 then round(v_profit/ v_h_paid) end,",
      ]]]]);
    case 'boundary_leaks_previous_hunt':
      /* ANCHOR MOVED 2026-09-22 with finding A-1: the bound is now `v_from`
         (greatest(active_since, now - 24h)) and there are three predicates
         rather than five. Widening ALL of them to `>=` is the same defect —
         a window credited at the instant of a restart leaks into the new
         hunt's totals. */
      return new Map([[MIG, [[
        "             and l.at > v_from) l",
        "             and l.at >= v_from) l",
      ], [
        "     and l.kind = 'combat' and l.intent = 'death'\n     and l.at > v_from;",
        "     and l.kind = 'combat' and l.intent = 'death'\n     and l.at >= v_from;",
      ], [
        "     and l.at > v_from\n   order by l.at desc, l.id desc limit 1;",
        "     and l.at >= v_from\n   order by l.at desc, l.id desc limit 1;",
      ]]]]);
    case 'analyzer_unbounded_scan':
      /* THE FINDING, PLANTED BACK. `v_from` becomes active_since again, so the
         scan has no time floor and the readout costs a walk of every accrue row
         since the hunt began — inside hr_state_of, on every envelope. */
      return new Map([[MIG, [[
        "  v_from      := greatest(v_st.active_since, v_now - c_window);\n  v_capped    := v_st.active_since < v_now - c_window;",
        '  v_from      := v_st.active_since;\n  v_capped    := false;',
      ]]]]);
    default: return undefined;
  }
};

const U = '00000000-0000-4000-8000-0000b5510c01';

/* THE FIXTURE WINDOWS. Written through the REAL hr_apply, in the shape
   accrual.js proposes for a combat settle: gold, an xp map, a SIGNED item map
   (loot positive, the night's burn negative) and the journal's aggregate meta.
   Every expectation below is computed from THESE numbers in JavaScript. */
const WINDOWS = [
  { gold: 1000, xp: { attack: 500, cooking: 900 }, ms: 3600000, kills: 200, ate: 3 },
  { gold: 500, xp: { attack: 250, strength: 125 }, ms: 1800000, kills: 100, ate: 1, stopped: 'hours' },
];
const LOOT_QTY = [10, 5];      // positive item delta per window
const BURN_QTY = [40, 0];      // negative item delta (arrows) per window

async function run(mutate) {
  const { db } = await bootReplay({ patches: patchesFor(mutate) });
  const q = async (sql, args) => (await db.query(sql, args)).rows;
  const ver = async () => Number((await q('select public.hr_state_of($1,0) as e', [U]))[0].e.version);
  const apply = async (delta) => (await q(
    'select public.hr_apply($1, 0, $2, gen_random_uuid(), $3::text::jsonb) as r',
    [U, await ver(), JSON.stringify(delta)]))[0].r;

  await db.query('insert into auth.users (id) values ($1)', [U]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [U]);
  await db.query('select public.hr_create_character(0)');

  /* THE TWO PROBE ITEMS ARE DERIVED FROM THE CATALOGUE, never typed: an id
     spelled here rots the day the catalogue is regenerated, and a guard that
     fails on its own fixture teaches everyone to ignore it. */
  const [loot] = await q(
    "select item_id, value from public.hr_items where kind is distinct from 'ammo' and value > 0 order by item_id limit 1");
  const [ammo] = await q(
    "select item_id, value from public.hr_items where kind = 'ammo' and value > 0 order by item_id limit 1");
  ok(!!loot && !!ammo, 'A0: the catalogue has no priced loot row and/or no priced ammo row.');
  if (!loot || !ammo) { await db.close(); return problems; }
  const LOOT_V = BigInt(loot.value);
  const AMMO_V = BigInt(ammo.value);

  // Start the hunt, then back-date it: the whole fixture runs inside one
  // connection where several rows can share an instant, and a two-hour elapsed
  // is also what makes raw XP/h and effective XP/h genuinely different numbers.
  let r = await apply({
    activity: { kind: 'combat', id: 'goblin', restart: true },
    journal: { kind: 'admin', intent: 'set_activity:combat:goblin' },
  });
  ok(r.ok === true, `A0: could not start the probe hunt: ${JSON.stringify(r)}`);
  await db.query(
    "update public.player_state set active_since = now() - interval '2 hours' where user_id = $1", [U]);

  // Stock the quiver — hr_apply refuses an item delta that would take a stack
  // below zero, correctly, so the burn has to be a burn of something held.
  // Journalled kind='admin', which the Analyzer does not read.
  r = await apply({
    items: { [ammo.item_id]: BURN_QTY.reduce((a, b) => a + b, 0) },
    journal: { kind: 'admin', intent: 'analyzer_probe_stock' },
  });
  ok(r.ok === true, `A0: could not stock the probe quiver: ${JSON.stringify(r)}`);

  /* A death row, which is where the Analyzer's `deaths` comes from. WRITTEN
     BEFORE THE WINDOWS, because a hunt that hits a stop rule goes IDLE and
     accrues nothing after it — so in production the window carrying
     `meta.stopped` is always the LAST one, and a fixture that kept accruing
     past a stop would be testing a state the engine cannot produce. The first
     draft did exactly that and read the stopping rule as null.
     */
  r = await apply({
    deaths: [{
      monster: 'goblin', recovery_ms: 120000, deaths_today: 1, deaths_lifetime: 1,
      resume_hp: 4, auto_eat_enabled: false, food_in_bag: false,
    }],
    journal: { kind: 'combat', intent: 'accrue', meta: { ms: 0, kills: 0 } },
  });
  ok(r.ok === true, `A0: the death row was refused: ${JSON.stringify(r)}`);

  for (let i = 0; i < WINDOWS.length; i++) {
    const w = WINDOWS[i];
    const items = {};
    if (LOOT_QTY[i]) items[loot.item_id] = LOOT_QTY[i];
    if (BURN_QTY[i]) items[ammo.item_id] = -BURN_QTY[i];
    r = await apply({
      gold: w.gold, xp: w.xp, ...(Object.keys(items).length ? { items } : {}),
      journal: {
        kind: 'combat',
        intent: 'accrue',
        meta: {
          ms: w.ms, kills: w.kills, ate: w.ate, capped: false,
          ...(w.stopped ? { stopped: w.stopped } : {}),
          /* A CLIENT-AUTHORED NUMBER, planted in every fixture row. Nothing on
             the server writes it; it is here so the `trusts_client_kills`
             mutation has something to trust, and so a future body that started
             reading a request-supplied count would be caught by A1 rather than
             by a player noticing their rate had doubled. */
          client_kills: w.kills * 10,
        },
      },
    });
    ok(r.ok === true, `A0: fixture window ${i + 1} was refused: ${JSON.stringify(r)}`);
  }

  const a = (await q('select public.hr_hunt_analyzer($1, 0) as a', [U]))[0].a;
  ok(!!a, 'A1: a running hunt got no Analyzer block at all.');
  if (!a) { await db.close(); return problems; }

  // ── A1. EVERY FIELD IS THE HAND-COMPUTED SUM ───────────────────────────
  const sum = (f) => WINDOWS.reduce((t, w) => t + (f(w) || 0), 0);
  const E = {
    windows: WINDOWS.length + 1,                       // + the death-row window
    paid_ms: sum((w) => w.ms),
    kills: sum((w) => w.kills),
    gold: sum((w) => w.gold),
    meals: sum((w) => w.ate),
    combat_xp: sum((w) => (w.xp.attack || 0) + (w.xp.strength || 0)),
    loot_value: BigInt(LOOT_QTY.reduce((t, n) => t + n, 0)) * LOOT_V,
    supplies_value: BigInt(BURN_QTY.reduce((t, n) => t + n, 0)) * AMMO_V,
    deaths: 1,
  };
  E.profit = BigInt(E.gold) + E.loot_value - E.supplies_value;

  for (const k of ['windows', 'paid_ms', 'kills', 'gold', 'meals', 'combat_xp', 'deaths']) {
    ok(BigInt(a[k]) === BigInt(E[k]),
      `A1: ${k} is ${a[k]}; the fixture rows sum to ${E[k]}.`);
  }
  ok(BigInt(a.loot_value) === E.loot_value,
    `A1: loot_value is ${a.loot_value}; ${LOOT_QTY.reduce((t, n) => t + n, 0)} x the catalogue value `
    + `of ${loot.item_id} (${LOOT_V}) is ${E.loot_value}. Loot is the POSITIVE side of the signed `
    + 'item map, priced from the sealed catalogue.');
  ok(BigInt(a.supplies_value) === E.supplies_value,
    `A1: supplies_value is ${a.supplies_value}, expected ${E.supplies_value} — the NEGATIVE side of `
    + 'the same map is what the night burned, and it must not be counted as loot.');
  ok(BigInt(a.profit) === E.profit,
    `A1: profit is ${a.profit}, expected gold + loot - supplies = ${E.profit}.`);
  // THE CLIENT NUMBER IS NOT READ. This is the arm the mutation targets.
  ok(BigInt(a.kills) !== BigInt(E.kills) * 10n,
    'A1: the Analyzer summed a client-authored `client_kills` key. Every counter it reads must have '
    + 'been written by hr_apply out of a SETTLED window — there is no client kill count anywhere in '
    + 'this feature (design §5).');
  // COMBAT XP ONLY: the 900 Cooking XP must not be in the rate.
  ok(BigInt(a.combat_xp) === BigInt(E.combat_xp),
    `A1: combat_xp is ${a.combat_xp}, expected ${E.combat_xp}. hr_skills.cat is the server's own `
    + 'definition of a combat skill; a cooking level must not inflate a combat rate.');

  // ── A2. THE RATES, AND WHICH DENOMINATOR EACH USES ─────────────────────
  /* ⚠ THE RATES DIVIDE BY `window_ms`, NOT `elapsed_ms` (finding A-1). On this
       fixture the hunt is minutes old so the two are equal, and this arm SAYS
       so rather than leaving the reader to notice: if they ever diverge here,
       the arms below would be comparing the server's window against the
       guard's idea of the whole hunt and passing for the wrong reason. A6
       drives the case where they genuinely differ. */
  ok(a.window_capped === false && Number(a.window_ms) === Number(a.elapsed_ms),
    `A2 CANNOT RUN AS WRITTEN: the fixture hunt is already capped (window ${a.window_ms} ms vs `
    + `elapsed ${a.elapsed_ms} ms). These arms assume an uncapped hunt.`);
  const elapsedH = Number(a.window_ms) / 3600000;
  const paidH = Number(a.paid_ms) / 3600000;
  ok(elapsedH > paidH,
    `A2 CANNOT RUN: elapsed (${elapsedH}h) is not greater than paid (${paidH}h), so the two `
    + 'denominators are indistinguishable and this arm proves nothing.');
  ok(Number(a.xp_per_h) === Math.round(Number(a.combat_xp) / elapsedH),
    `A2: XP/h is ${a.xp_per_h}; over ELAPSED it is ${Math.round(Number(a.combat_xp) / elapsedH)}.`);
  ok(Number(a.raw_xp_per_h) === Math.round(Number(a.combat_xp) / paidH),
    `A2: raw XP/h is ${a.raw_xp_per_h}; over PAID it is ${Math.round(Number(a.combat_xp) / paidH)}.`);
  ok(Number(a.raw_xp_per_h) > Number(a.xp_per_h),
    'A2: raw XP/h is not above effective XP/h. The GAP between them is the diagnosis a player uses '
    + 'to learn their stance or their supplies are wrong; if it is zero the denominators are the same.');
  ok(Number(a.profit_per_h) === Math.round(Number(a.profit) / elapsedH),
    `A2: profit/h is ${a.profit_per_h}; over ELAPSED it is ${Math.round(Number(a.profit) / elapsedH)}. `
    + 'A hunt that spends half its night knocked out is not profitable, and the number used to '
    + 'choose a spawn must not hide that (design §3 note 3).');
  ok(Number(a.downtime_ms) === Number(a.window_ms) - Number(a.paid_ms),
    'A2: downtime is not the window minus paid.');
  ok(a.stopped === 'hours',
    `A2: the Analyzer named '${a.stopped}' as the stopping rule; the LAST window carrying one said `
    + "'hours'. meta.stopped is the only record of why a night ended.");
  ok(a.settled_at !== null, 'A2: the honesty line is empty after two settles.');

  // ── A3. A RESTART FORGETS THE NIGHT, AND DELETES NOTHING ───────────────
  const rowsBefore = Number((await q(
    "select count(*)::int n from public.player_ledger where user_id=$1 and kind='combat' and intent='accrue'",
    [U]))[0].n);
  r = await apply({
    activity: { kind: 'combat', id: 'goblin', restart: true },
    journal: { kind: 'admin', intent: 'set_activity:combat:goblin' },
  });
  ok(r.ok === true, `A3: the restart was refused: ${JSON.stringify(r)}`);
  const a2 = (await q('select public.hr_hunt_analyzer($1, 0) as a', [U]))[0].a;
  ok(Number(a2.kills) === 0 && Number(a2.windows) === 0,
    `A3: a restarted hunt still reads the previous night (${a2.kills} kills, ${a2.windows} windows). `
    + 'The Analyzer only ever looks forward from active_since — that is why there is no counter '
    + 'table to reset.');
  const rowsAfter = Number((await q(
    "select count(*)::int n from public.player_ledger where user_id=$1 and kind='combat' and intent='accrue'",
    [U]))[0].n);
  ok(rowsAfter === rowsBefore,
    `A3: the restart changed the journal (${rowsBefore} -> ${rowsAfter}). The Analyzer forgets; the `
    + 'ledger does not.');

  // ── A4. IDLE IS NULL, NOT A ZEROED READOUT ─────────────────────────────
  r = await apply({
    activity: { kind: 'idle', id: null },
    journal: { kind: 'admin', intent: 'set_activity:idle' },
  });
  ok(r.ok === true, `A4: could not stop the probe hunt: ${JSON.stringify(r)}`);
  const a3 = (await q('select public.hr_hunt_analyzer($1, 0) as a', [U]))[0].a;
  ok(a3 === null,
    'A4: an idle character got an Analyzer block. A zero is a CLAIM about a hunt that never ran; '
    + 'the panel renders em-dashes off the absence (HUNT_ANALYZER_UI.md §3).');

  /* ── A6. THE SCAN IS BOUNDED, AND THE DENOMINATOR IS BOUNDED WITH IT ───
     hr_hunt_analyzer is spliced into hr_state_of, so it runs on EVERY envelope
     — every poll, every intent, every reload, every world-tick settle. Before
     finding A-1 it walked every accrue row since `active_since`, which moves
     only on a restart, five separate times, with no LIMIT and no time floor
     under player_ledger's 90-day retention: ~130,000 rows for a character left
     on one monster. A readout that costs more than the settle it describes is a
     readout that gets turned off under load.

     ⚠ AND THE DENOMINATOR HAD TO MOVE WITH IT. A floor on the rows alone would
       divide one day of gold by five days of elapsed and print a profit/h a
       player would act on and be wrong about — the "browser says one thing, the
       server says another" class arriving through arithmetic. So this arm
       asserts BOTH: the old rows are gone AND every rate is over the window
       that produced them, with `elapsed_ms` still describing the whole hunt. */
  await db.query("update public.player_state set active_kind='combat', active_id='goblin', "
    + "active_since = now() - interval '72 hours' where user_id=$1 and slot=0", [U]);
  /* MEASURED AS A DELTA, not against absolutes: the fixture's own windows are
     still on the journal (A3 proved the restart deletes nothing) and they are
     inside the 24 h window too. Reading before and after is what isolates the
     two rows this arm plants. */
  const a6base = (await q('select public.hr_hunt_analyzer($1, 0) as a', [U]))[0].a;
  // One accrue row INSIDE the 24 h window and one well OUTSIDE it. Written
  // straight to the journal: hr_apply stamps `at` with now() and this arm needs
  // a row older than the floor, which no legitimate writer can produce today.
  await db.query(
    "insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at) "
    + "values ($1,0,'combat','accrue',$2,0,0,0,0,$3::jsonb, now() - interval '48 hours'),"
    + "       ($1,0,'combat','accrue',$4,0,0,0,0,$5::jsonb, now() - interval '1 hour')",
    [U, 7777, JSON.stringify({ ms: 3600000, kills: 999, ate: 0, delta: {} }),
      111, JSON.stringify({ ms: 600000, kills: 5, ate: 0, delta: {} })]);
  const a6 = (await q('select public.hr_hunt_analyzer($1, 0) as a', [U]))[0].a;
  ok(a6 && a6.window_capped === true,
    'A6: a 72-hour-old hunt did not report a capped window. The scan has no floor, so it walks every '
    + 'accrue row since active_since on every envelope.');
  ok(a6 && Math.abs(Number(a6.window_ms) - 24 * 3600000) < 60000,
    `A6: the window is ${a6 && a6.window_ms} ms, not the 24 hours the rows are floored at.`);
  ok(a6 && Number(a6.elapsed_ms) > Number(a6.window_ms),
    'A6: elapsed_ms was floored along with the window. `started_at` and `elapsed_ms` describe the '
    + 'WHOLE hunt — that is what the player asked for when they started it.');
  ok(a6 && a6base && Number(a6.kills) - Number(a6base.kills) === 5
     && Number(a6.gold) - Number(a6base.gold) === 111,
    `A6: planting one row INSIDE the window (5 kills, 111 gold) and one 48 HOURS OLD (999 kills, `
    + `7,777 gold) moved the readout by ${a6 && a6base && Number(a6.kills) - Number(a6base.kills)} kills `
    + `and ${a6 && a6base && Number(a6.gold) - Number(a6base.gold)} gold. Only the in-window row may `
    + 'count — if the old one does, the scan has no floor and its cost is the whole 90-day retention.');
  ok(a6 && Number(a6.window_ms) > 0
     && Number(a6.kills_per_h) === Math.round(Number(a6.kills) / (Number(a6.window_ms) / 3600000)),
    `A6: kills/h is ${a6 && a6.kills_per_h}; over the WINDOW it is `
    + `${a6 && Math.round(Number(a6.kills) / (Number(a6.window_ms) / 3600000))}. A rate whose numerator `
    + 'is one day and whose denominator is three is a number a player would choose a spawn on.');
  ok(a6 && new Date(a6.window_from).getTime() > new Date(a6.started_at).getTime(),
    'A6: window_from is not later than started_at on a capped hunt, so the envelope does not say '
    + 'which span these numbers cover and the panel cannot print it.');

  // ── A5. IT IS A READ, AND IT IS THE ENVELOPE'S ─────────────────────────
  const acl = await q(
    "select has_function_privilege('authenticated','public.hr_hunt_analyzer(uuid,int)','execute') as x");
  ok(acl[0].x === false,
    'A5: `authenticated` can call hr_hunt_analyzer directly. It mirrors hr_bestiary_of\'s posture: '
    + 'engine-only, and the number reaches the browser on the envelope.');

  await db.close();
  return problems;
}

// ── HARNESS ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  console.log('tests/hunt-analyzer.mjs — mutation catalogue\n');
  for (const [id, why] of Object.entries(MUTATIONS)) console.log(`  ${id.padEnd(30)} ${why}`);
  process.exit(0);
}
const only = (argv.find((a) => a.startsWith('--mutate=')) || '').split('=')[1] || null;

if (argv.includes('--selftest')) {
  let bad = 0;
  for (const id of Object.keys(MUTATIONS)) {
    problems.length = 0;
    let found;
    try { found = await run(id); } catch (e) {
      if (e.harness) { console.log(`  ✗ ${id}: HARNESS — ${e.message}`); bad++; continue; }
      found = [`threw: ${e.message}`];
    }
    if (found.length === 0) { console.log(`  ✗ ${id}: NOT CAUGHT`); bad++; }
    else console.log(`  ✓ ${id}: caught (${found.length} assertion(s))`);
  }
  problems.length = 0;
  const clean = await run(null);
  if (clean.length) { console.log(`  ✗ UNMUTATED run is red:\n    ${clean.join('\n    ')}`); bad++; }
  console.log(bad ? `\nhunt-analyzer --selftest: ${bad} problem(s)` : '\nhunt-analyzer --selftest: every mutation caught, unmutated run green');
  process.exit(bad ? 1 : 0);
}

let found;
try { found = await run(only); } catch (e) {
  if (e.harness) { console.log(`hunt-analyzer: HARNESS — ${e.message}`); process.exit(1); }
  throw e;
}
if (found.length) {
  console.log(`  ✗ hunt-analyzer: ${found.length} problem(s)`);
  for (const p of found) console.log(`      ${p}`);
  process.exit(only ? 0 : 1);
}
console.log('hunt-analyzer: OK — every field equals a hand-computed sum over the fixture ledger '
  + 'rows, loot and supplies are the two signs of one map priced from the sealed catalogue, combat '
  + 'XP is the catalogue\'s answer, profit/h divides by elapsed, a client-authored count is ignored, '
  + 'and a restart forgets the night without deleting a journal row.');
process.exit(only ? 1 : 0);
