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
//   S4  a `count` or a `next` is refused 400 `bad_activity` on shape: no count is kept to stop a run at, so honouring
//       neither would burn the whole stack when the player asked for one
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
  let server; let catalogue; let recipes; let hearth;
  try {
    [server, catalogue, recipes, hearth] = await Promise.all([
      import(mod('supabase/functions/hr-accrue/set-activity.js')),
      import(mod('supabase/functions/hr-accrue/catalogue.js')),
      import(mod('src/data/recipes.js')),
      import(mod('src/data/hearth.js')),
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

  /* ── S4 — no activity takes a count or a next. */
  for (const extra of [{ count: 1 }, { count: 5000 }, { next: 'hunt' }]) {
    const r = await set({ kind: 'artisan', id: fuelIds[0] || 'fuel_bones', ...extra }).catch((e) => ({ status: 0, body: { error: String(e.message) } }));
    if (r.status !== 400 || !r.body || r.body.error !== 'bad_activity') {
      fail(`S4: set_activity answered ${r.status} ${JSON.stringify(r.body)} for ${JSON.stringify(extra)}. It must be 400 bad_activity `
        + 'on shape: no count is kept, so a count honoured as nothing burns the whole stack.');
    }
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
