// ============================================================================
// tests/activity-seam.mjs — THE ACTIVITY INTENT REFUSES WHAT THE ENGINE CANNOT PAY.
//
// A lockout, not a display bug: if `set_activity` lets the pointer hold an id the accrual engine cannot price, the
// engine refuses the COLLECT, the refused collect refuses every later SWITCH, and the player is stuck until a STOP
// forfeits the window. So the intent answers on SHAPE, before any database statement, for everything the engine
// cannot price. Re-aimed at the one-town-work cut (09-crafting.md 4.17): the bench and gathering left, and the
// `artisan` kind is the Great Hearth's fuel runs and nothing else. (Its bench arms, S6/S6d's unpayable cooking bench,
// retired with the bench: no bench is left to be unpayable.)
//
//   S1  a `gather` declaration is refused 409 `activity_unsupported` ON SHAPE: the kind still parses, so it is
//       refused by name, never as malformed, and never reaches the rate gate
//   S2  an `artisan` id that is no fuel run (every bench row src/data still holds, and a cut one) is refused 409
//       `unknown_activity` ON SHAPE; CONTROL: a fuel run is not refused on shape (it reaches the database)
//   S3  the engine's FUEL_RUNS are exactly the data's `fuel_<item>` rows on the Hearth's bench (src/data/recipes.js
//       inner_flame, one per src/data/hearth.js HEARTH_FUELS fuel): a fuel the bag offers that the engine cannot price
//       is the lockout again, and a non-fuel row it could price is the bench back
//   S4  a fuel run takes a count ("Burn" is a count of one), a whole number 1..100000; an unreadable count, a count on
//       anything else and any `next` are refused 400 `bad_activity` on shape (a count silently dropped burns the whole
//       stack when the player asked for one); and the count rides the statement hr_apply stores
//
// Node-only, no network. `runAll()` is imported by tests/run-smoke.mjs.
// ============================================================================

import { isMain } from './_is-main.mjs';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

const problems = [];
const fail = (m) => problems.push(m);

const USER = '00000000-0000-4000-8000-000000000056';
const KEY = '00000000-0000-4000-8000-000000000001';
const NO_DB = async () => { throw new Error('reached the database: this declaration must be refused on shape'); };
/* A bench recipe the cut removed. It must be refused whatever src/data still holds. */
const CUT_BENCH_ID = 'forge_iron_platebody';

export async function runAll() {
  problems.length = 0;
  let server; let catalogue; let recipes; let hearth; let request;
  try {
    [server, catalogue, recipes, hearth, request] = await Promise.all([
      import(mod('supabase/functions/hr-accrue/set-activity.js')),
      import(mod('supabase/functions/hr-accrue/catalogue.js')),
      import(mod('src/data/recipes.js')),
      import(mod('src/data/hearth.js')),
      import(mod('supabase/functions/hr-accrue/request.js')),
    ]);
  } catch (e) {
    fail('the activity seam could not be loaded, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }
  const set = (activity, exec = NO_DB) => server.runSetActivity({ exec, user: USER, slot: 0, intentId: KEY, activity });

  /* ── S1 — gather is refused by name, on shape. */
  {
    const r = await set({ kind: 'gather', id: 'normal_tree' }).catch((e) => ({ status: 0, body: { error: String(e.message) } }));
    if (r.status !== 409 || !r.body || r.body.error !== 'activity_unsupported') {
      fail(`S1: set_activity answered ${r.status} ${JSON.stringify(r.body)} for a gather declaration. It must be 409 `
        + 'activity_unsupported on shape, or a gather pointer the engine cannot price can be set.');
    }
  }

  /* ── S2 — an artisan id that is no fuel run is refused on shape. */
  const fuelIds = Object.keys(catalogue.FUEL_RUNS);
  const benchIds = Object.values(recipes.ARTISAN_RECIPES || {}).flat().map((r) => r && r.id)
    .filter((id) => typeof id === 'string' && !fuelIds.includes(id));
  for (const id of [CUT_BENCH_ID, ...benchIds.slice(0, 5)]) {
    const r = await set({ kind: 'artisan', id }).catch((e) => ({ status: 0, body: { error: String(e.message) } }));
    if (r.status !== 409 || !r.body || r.body.error !== 'unknown_activity') {
      fail(`S2: set_activity answered ${r.status} ${JSON.stringify(r.body)} for the bench recipe '${id}'. It must be `
        + '409 unknown_activity on shape, or the pointer holds a bench the engine refuses (the switch lockout).');
    }
  }
  /* CONTROL: a fuel run is NOT refused on shape (it reaches the database). */
  if (!fuelIds.length) fail('S2 CONTROL: FUEL_RUNS is EMPTY, so the Hearth pays nothing and S2 compared nothing.');
  else {
    let reached = false;
    await set({ kind: 'artisan', id: fuelIds[0] }, async () => { reached = true; throw new Error('stop here'); }).catch(() => null);
    if (!reached) fail(`S2 CONTROL: the fuel run '${fuelIds[0]}' was refused on shape: "refuse everything" would pass S2 and pay nothing.`);
  }

  /* ── S3 — the engine's fuel runs are exactly the data's. */
  {
    const want = (hearth.HEARTH_FUELS || []).map((f) => hearth.fuelRecipeId(f.item)).sort();
    const rows = (recipes.ARTISAN_RECIPES || {}).inner_flame || [];
    const dataFuel = rows.filter((r) => r && typeof r.id === 'string' && /^fuel_/.test(r.id)).map((r) => r.id).sort();
    const got = [...fuelIds].sort();
    if (JSON.stringify(got) !== JSON.stringify(dataFuel)) {
      fail(`S3: FUEL_RUNS [${got.join(', ')}] is not the data's Hearth fuel rows [${dataFuel.join(', ')}].`);
    }
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fail(`S3: FUEL_RUNS [${got.join(', ')}] is not one run per HEARTH_FUELS fuel [${want.join(', ')}].`);
    }
    for (const id of got) {
      const e = catalogue.FUEL_RUNS[id];
      if (!e || e.skill !== 'inner_flame' || e.recipe.output) fail(`S3: '${id}' is not an output-less Inner Flame run.`);
    }
  }

  /* ── S4 — a fuel run takes a count; nothing takes a next. */
  const fuelId = fuelIds[0] || 'fuel_bones';
  const tries = [
    ...[null, 0, -1, 1.5, 100001].map((count) => ({ kind: 'artisan', id: fuelId, count })),
    { kind: 'idle', id: null, count: 1 }, { kind: 'artisan', id: fuelId, next: 'wait' },
    { kind: 'artisan', id: fuelId, count: 1, next: 'wait' },
  ];
  for (const raw of tries) {
    /* Through the parser the shell runs: what reaches the intent is request.js's reading of the body. */
    const r = await set(request.parseIntent({ verb: 'set_activity', activity: raw }).activity).catch((e) => ({ status: 0, body: { error: String(e.message) } }));
    if (r.status !== 400 || !r.body || r.body.error !== 'bad_activity') {
      fail(`S4: set_activity answered ${r.status} ${JSON.stringify(r.body)} for ${JSON.stringify(raw)}. It must be 400 bad_activity `
        + 'on shape: a count silently dropped burns the whole stack.');
    }
  }
  for (const count of [1, 100000]) {
    const read = request.parseIntent({ verb: 'set_activity', activity: { kind: 'artisan', id: fuelId, count } }).activity;
    const r = await set(read).catch(() => ({ status: 0, body: { error: 'database' } }));
    if (read.count !== count || (r.status === 400 && r.body && r.body.error === 'bad_activity')) {
      fail(`S4: a count of ${count} on a fuel run was refused on shape (read ${JSON.stringify(read)}, ${r.status} ${JSON.stringify(r.body)}): "Burn" is a count of one.`);
    }
    const d = server.activityDelta('artisan', fuelId, null, count);
    if (d.activity.count !== count) fail(`S4: the statement for a run of ${count} carries ${JSON.stringify(d.activity)}: hr_apply keeps no count and the run burns the stack.`);
  }
  if ('count' in server.activityDelta('artisan', fuelId, null, undefined).activity || 'count' in server.activityDelta('idle', null, null, 1).activity) {
    fail('S4: a statement with no count, or an idle, carries one.');
  }
  return problems;
}

if (isMain(import.meta.url)) {
  const found = await runAll();
  if (found.length) {
    for (const p of found) console.error('FAIL: ' + p + '\n');
    console.error(`activity-seam: ${found.length} problem(s)`);
    process.exit(1);
  }
  console.log('activity-seam: OK (S1, S2, S3, S4)');
}
