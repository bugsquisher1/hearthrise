#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/artisan-progress-model.mjs — THE TWO ARTISAN SHAPES, END TO END.
//
// THE CLAIM UNDER TEST, in two lines:
//   · a recipe unlock written to the database through hr_apply reaches
//     `gateOk` and the recipe COOKS — and deleting that one row LOCKS it;
//   · a Kitchen rung written to the database reaches `burnChance` and the
//     span burns NOTHING — and deleting that one row makes the same seeded
//     span burn at the catalogue rate.
//
// Every step runs for real, on a real PostgreSQL (PGlite/WASM, in process),
// with THE WHOLE MIGRATION CHAIN applied verbatim through
// tests/schema-replay.mjs — so the two new migrations' own self-verifying
// blocks (§0 refuse-to-install, §7 structural, §8 behavioural) EXECUTE here
// too, on every run, rather than only when somebody applies them:
//
//   player_progress row  (real table, real guard trigger)
//     → public.hr_unlock_levels   (the authoritative seam, real SQL)
//     → public.hr_perks_of        (real SECURITY DEFINER function)
//     → the envelope index.ts forwards, field for field
//     → makeBonus('noBurn') / state.unlockedRecipes
//     → simulateArtisanSpan       (real src/core/artisan-sim.js)
//
// ── WHY THE DELETIONS ARE THE POINT ─────────────────────────────────────
// "The row makes it work" is half a claim. The half that matters for a
// server that is about to own every player's inventory is: WITHOUT the row,
// does it fail CLOSED? A gate that opens when its state is missing hands out
// eight recipes; a burn relief that applies when its state is missing is
// harmless, but the reverse — the shape defaulting to "burn-proof" — would
// let a server mint food. So A3 and A5 delete the row and require the
// simulation to LOCK and to BURN respectively.
//
// ── MUTATION ────────────────────────────────────────────────────────────
//   node tests/artisan-progress-model.mjs --mutate
// plants ten real defects — nine in the SQL, one in the forwarding adapter —
// one at a time, and FAILS if any slips past.
//
// Run standalone:  node tests/artisan-progress-model.mjs
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { pathToFileURL } from 'node:url';

import { bootReplay } from './schema-replay.mjs';
import { makeBonus } from '../src/core/perks.js';
import { burnChance, BURN_BASE, KITCHEN_NO_BURN, recipeInputs } from '../src/core/artisan.js';
import {
  simulateArtisanSpan, indexArtisanRecipes, duplicateRecipeIds, STOP_REASON,
} from '../src/core/artisan-sim.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { ITEMS } from '../src/data/items.js';
import { ROOM_PERKS } from '../src/data/perks.js';
import { mulberry32, rngFrom } from '../src/core/rng.js';
import { xpForLevel } from '../src/core/xp.js';

const USER = '00000000-0000-4000-c000-a5a5a5a5a5a5';

let problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ── THE GATED RECIPES, ENUMERATED FROM THE DATA ─────────────────────────
   Never a hand-typed list: a hand-typed list cannot notice a ninth gate, and
   a gate the catalogue does not know is a recipe that is permanently locked
   server-side. Eight today. */
const RECIPE_INDEX = indexArtisanRecipes(ARTISAN_RECIPES);
const GATED = Object.keys(RECIPE_INDEX)
  .filter((id) => RECIPE_INDEX[id].recipe.gated)
  .sort();

/* A gated COOKING recipe — the one bench where both shapes meet, because
   cooking is the only bench that burns. */
const GATED_COOK = GATED.filter((id) => RECIPE_INDEX[id].skill === 'cooking');

/* An UNGATED cooking recipe for the burn measurements, chosen by the
   PROPERTY that matters (cheapest inputs, so a long span never runs dry)
   rather than by name or by array position — a fixture chosen by index is a
   fixture chosen at random, and a span that stops on SUPPLIES at tick 40
   measures nothing. */
const BURN_RECIPE = (ARTISAN_RECIPES.cooking || [])
  .filter((r) => r && !r.gated && r.output && r.req)
  .sort((a, b) => Object.keys(recipeInputs(a)).length - Object.keys(recipeInputs(b)).length
                  || a.req - b.req || a.id.localeCompare(b.id))[0];

// ── the harness ───────────────────────────────────────────────────────────
async function boot(patches) {
  const { db } = await bootReplay(patches ? { patches } : {});
  await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [USER]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USER]);
  const r = await db.query('select public.hr_create_character(0) as r');
  const c = r.rows[0].r;
  if (!(c?.ok === true || c?.created === true)) {
    throw new Error(`SETUP: hr_create_character failed — ${JSON.stringify(c)}`);
  }
  return db;
}

const perksOf = (db, slot = 0) =>
  db.query('select public.hr_perks_of($1::uuid,$2::int) as p', [USER, slot])
    .then((r) => r.rows[0].p);

/** Grant a room rung the way a spend RPC will: a kind='unlock' row, absolute. */
async function grantRoom(db, id, rung) {
  await db.query(
    `insert into public.player_progress (user_id, slot, kind, key, period_key, value)
     values ($1,0,'unlock',$2,'',$3)
     on conflict (user_id, slot, kind, key, period_key)
       do update set value = greatest(public.player_progress.value, excluded.value)`,
    [USER, `room:${id}`, rung]);
}

/** Grant a recipe scroll THE WAY THE ENGINE WILL: a `flag` progress op through
    hr_apply. Deliberately not a raw INSERT — the whole point of storing recipes
    as flags is that hr_apply can write them, and a test that side-stepped
    hr_apply would not be testing the write path at all. */
async function grantRecipe(db, scrollId) {
  const v = await db.query(
    'select version from public.player_state where user_id=$1 and slot=0', [USER]);
  const r = await db.query(
    `select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text::jsonb) as r`,
    [USER, v.rows[0].version, JSON.stringify({
      progress: [{ kind: 'flag', key: `recipe:${scrollId}`, period: '', add: 1 }],
      journal: { kind: 'accrue', intent: 'recipe:test' },
    })]);
  return r.rows[0].r;
}

/* ── THE FORWARDING ADAPTER ──────────────────────────────────────────────
   This is exactly what supabase/functions/hr-accrue/index.ts does with the
   envelope, and it is deliberately nothing more than field access: there is
   no projection logic to get wrong and no second copy of a rule. `?? null`
   rather than `?? {}` for the same reason `toolCarry` uses it — null means
   "this database has no such channel", and the fail-closed default lives in
   the SHAPE (an absent key is a locked recipe), not in a fallback. */
function forwardEnvelope(env) {
  const perks = (env && env.ok === true) ? env : null;
  return {
    perks,
    unlockedRecipes: (perks && perks.unlockedRecipes) ?? null,
  };
}

/* Run a real artisan span with the server's own state, and report it. */
function cook(db, { recipeId, envelope, cookingLevel, ticksWanted = 400, seed = 0xc00c1e }) {
  const entry = RECIPE_INDEX[recipeId];
  const inputs = recipeInputs(entry.recipe);
  /* ⚠ SUPPLY-LIMITED, NOT TIME-LIMITED, and that is the whole reason the two
     spans in A5 are comparable. A Kitchen rung also pays `cookSpeed`, so a
     fixed WINDOW yields a different tick COUNT with and without it — measured
     250 vs 266 on the first draft, which made the burn counts incomparable and
     produced a false failure that was really the channel working. Exactly
     `ticksWanted` cooks' worth of input makes both spans stop on SUPPLIES at
     the same tick, so the only variable left is the burn roll. */
  const inventory = {};
  for (const id of Object.keys(inputs)) inventory[id] = inputs[id] * ticksWanted;

  const fwd = forwardEnvelope(envelope);
  const state = {
    activeSkill: entry.skill,
    skillTargetId: recipeId,
    skills: { [entry.skill]: xpForLevel(cookingLevel) },
    inventory,
    equipment: {},
    unlockedRecipes: fwd.unlockedRecipes,
    toolCarry: {},
    stats: {},
  };
  const fx = {
    addItem: (id, n) => { state.inventory[id] = (state.inventory[id] || 0) + n; },
    removeItem: (id, n) => { state.inventory[id] = (state.inventory[id] || 0) - n; },
    addXp: () => {},
  };
  const from = Date.UTC(2026, 7, 16, 0, 0, 0);
  const summary = simulateArtisanSpan(state, {
    fromMs: from,
    /* Deliberately far more time than the inventory can fill — see the note on
       `inventory` above. The span is bounded by supplies. */
    toMs: from + ticksWanted * ((entry.recipe.ms || 3000) + 1) * 20,
    recipes: RECIPE_INDEX,
    items: ITEMS,
    rng: rngFrom(mulberry32(seed)),
    bonus: makeBonus(fwd.perks),
    fx,
    away: true,
  });
  return summary;
}

// ════════════════════════════════════════════════════════════════════════
async function run(patches) {
  const db = await boot(patches);

  // ── A0 · THE FIXTURES ARE REAL ────────────────────────────────────────
  // Everything below is derived from src/data; if a derivation came back
  // empty every later block would pass vacuously.
  ok(GATED.length === 8,
    `A0: ${GATED.length} gated recipes found in the data, expected 8. If the content grew, the `
    + 'catalogue and this expectation move together — a gate the catalogue does not know is a '
    + 'recipe that is permanently locked server-side.');
  ok(GATED_COOK.length > 0, 'A0: no gated COOKING recipe — the gate/burn intersection is untestable');
  ok(!!BURN_RECIPE, 'A0: no ungated cooking recipe — the burn measurements have no fixture');
  ok(duplicateRecipeIds(ARTISAN_RECIPES).length === 0,
    'A0: a recipe id is claimed by two benches, so the index resolves one of them arbitrarily');

  // ── A1 · EVERY GATE IN THE DATA HAS A CATALOGUE HOME, AS A FLAG ───────
  // The write path is `hr_apply` + kind='flag'. A gate stored under any other
  // kind is a gate the engine can never open.
  {
    const rows = await db.query(
      `select unlock_id, progress_kind, merge from public.hr_unlocks where namespace='recipe'`);
    const byId = new Map(rows.rows.map((r) => [r.unlock_id, r]));
    for (const id of GATED) {
      const key = `recipe:${RECIPE_INDEX[id].recipe.gated}`;
      const row = byId.get(key);
      ok(!!row, `A1: ${key} (gate of ${id}) is not in hr_unlocks — the guard would REFUSE the grant, `
        + 'so earning the scroll would cost the player the whole night to a bad_delta');
      if (row) {
        ok(row.progress_kind === 'flag',
          `A1: ${key} is stored as '${row.progress_kind}' — only 'flag' is in hr_apply's progress `
          + 'allowlist, so any other kind puts the gate beyond the engine\'s reach forever');
      }
    }
  }

  // ── A2 · THE FAIL-CLOSED DEFAULT: a fresh character has NOTHING ───────
  {
    const env = await perksOf(db);
    ok(env?.ok === true, `A2: a fresh character returned ${JSON.stringify(env)}`);
    ok(JSON.stringify(env.unlockedRecipes) === '{}',
      `A2: a fresh character reads unlockedRecipes ${JSON.stringify(env.unlockedRecipes)} — a `
      + 'non-empty default grants a recipe nobody earned');
    ok(JSON.stringify(env.rooms) === '{}',
      `A2: a fresh character reads rooms ${JSON.stringify(env.rooms)}`);
    ok(near(makeBonus(env)('noBurn'), 0),
      'A2: a character with no Kitchen reads a noBurn relief — the server would protect food the '
      + 'client would burn');
    ok(near(burnChance(BURN_RECIPE, BURN_RECIPE.req, makeBonus(env)('noBurn')), BURN_BASE),
      'A2: a perkless character does not burn at the base rate');
  }

  // ── A3 · THE GATE OPENS ONLY WITH THE ROW — AND CLOSES WITHOUT IT ─────
  // The load-bearing pair. Same recipe, same seed, same everything; the ONLY
  // difference is one player_progress row, written and then deleted.
  const gatedId = GATED_COOK[0];
  const gatedScroll = RECIPE_INDEX[gatedId].recipe.gated;
  const gatedReq = RECIPE_INDEX[gatedId].recipe.req || 1;
  {
    // (i) LOCKED — before the grant.
    const before = cook(db, { recipeId: gatedId, envelope: await perksOf(db), cookingLevel: 99 });
    ok(before.stoppedBy === STOP_REASON.GATE,
      `A3(i): with no unlock row the span stopped with ${before.stoppedBy}, expected GATE. The `
      + 'server would have cooked a recipe the player has not earned.');
    ok(before.ticks === 0 && before.produced === 0,
      `A3(i): a locked recipe produced ${before.produced} over ${before.ticks} ticks`);

    // (ii) THE REAL WRITE PATH — a flag progress op through hr_apply.
    const applied = await grantRecipe(db, gatedScroll);
    ok(applied?.ok === true,
      `A3(ii) THE WRITE PATH IS BROKEN: hr_apply refused the recipe flag — ${JSON.stringify(applied)}`);
    const env = await perksOf(db);
    ok(env.unlockedRecipes?.[gatedScroll] === true,
      `A3(ii): after the grant unlockedRecipes reads ${JSON.stringify(env.unlockedRecipes)} — the `
      + `projection does not carry ${gatedScroll} in the client's own { id: true } wire shape`);

    const after = cook(db, { recipeId: gatedId, envelope: env, cookingLevel: 99 });
    ok(after.stoppedBy !== STOP_REASON.GATE && after.ticks > 0,
      `A3(ii): with the unlock row the span still stopped with ${after.stoppedBy} after `
      + `${after.ticks} ticks — the row does not reach gateOk`);
    ok(after.produced + after.burnt > 0, 'A3(ii): an unlocked recipe produced nothing at all');

    // (iii) DELETE THE ROW — the recipe must LOCK again. This is the mutation
    //       an attacker (or a bad migration) performs, executed as a test.
    await db.query(
      `delete from public.player_progress where user_id=$1 and kind='flag' and key=$2`,
      [USER, `recipe:${gatedScroll}`]);
    const gone = await perksOf(db);
    ok(JSON.stringify(gone.unlockedRecipes) === '{}',
      `A3(iii): after deleting the row unlockedRecipes reads ${JSON.stringify(gone.unlockedRecipes)}`);
    const relocked = cook(db, { recipeId: gatedId, envelope: gone, cookingLevel: 99 });
    ok(relocked.stoppedBy === STOP_REASON.GATE && relocked.ticks === 0,
      `A3(iii) FAIL-OPEN: with the unlock row DELETED the span ran ${relocked.ticks} ticks and `
      + `stopped with ${relocked.stoppedBy}. An absent row must mean LOCKED.`);
  }

  // ── A4 · noBurn, RUNG BY RUNG, THROUGH THE REAL SQL ──────────────────
  // The magnitudes are src/core/artisan.js's own KITCHEN_NO_BURN, so this
  // asserts the CHANNEL rather than re-stating a table.
  {
    for (let rung = 0; rung <= ROOM_PERKS.kitchen.length; rung++) {
      await db.query(
        `delete from public.player_progress where user_id=$1 and key='room:kitchen'`, [USER]);
      if (rung > 0) await grantRoom(db, 'kitchen', rung);
      const env = await perksOf(db);
      const relief = makeBonus(env)('noBurn');
      const expect = rung === 0 ? 0 : KITCHEN_NO_BURN[rung - 1];
      ok(near(relief, expect),
        `A4: Kitchen ${rung} reads noBurn ${relief}, expected ${expect}. The server would `
        + `${relief < expect ? 'DESTROY' : 'wrongly protect'} input the client would not.`);
    }
  }

  // ── A5 · THE END-TO-END BURN PAIR: 0 burns with the rung, catalogue rate
  //         without it. Same seed, same span, same inventory — one row apart.
  {
    const BURN_PROOF_RUNG = KITCHEN_NO_BURN.indexOf(BURN_BASE) + 1;   // the first burn-proof rung
    ok(BURN_PROOF_RUNG > 0,
      'A5: no Kitchen rung reaches BURN_BASE, so "cooks with 0 burns" is not achievable and this '
      + 'block would assert nothing');

    await db.query(`delete from public.player_progress where user_id=$1 and key='room:kitchen'`, [USER]);
    const bare = cook(db, { recipeId: BURN_RECIPE.id, envelope: await perksOf(db),
      cookingLevel: BURN_RECIPE.req, ticksWanted: 400 });

    await grantRoom(db, 'kitchen', BURN_PROOF_RUNG);
    const kitted = cook(db, { recipeId: BURN_RECIPE.id, envelope: await perksOf(db),
      cookingLevel: BURN_RECIPE.req, ticksWanted: 400 });

    ok(bare.ticks > 100 && kitted.ticks === bare.ticks,
      `A5 CONTROL: the two spans ran ${bare.ticks} and ${kitted.ticks} ticks — they must be the `
      + 'same span, or a burn-count difference could be a length difference');
    ok(kitted.burnt === 0,
      `A5: with Kitchen ${BURN_PROOF_RUNG} the span burnt ${kitted.burnt} of ${kitted.ticks} cooks. `
      + 'The player\'s Cast-Iron Range says 0%; the server just destroyed their food.');
    ok(bare.burnt > 0,
      `A5 CONTROL: with NO Kitchen the same seeded span burnt ${bare.burnt} — if it burns nothing `
      + 'either way, the 0 above is not evidence of anything');
    /* The rate is the catalogue's, not an invented band: BURN_BASE at the
       recipe's own required level, with a generous tolerance for a 400-draw
       sample. */
    const rate = bare.burnt / bare.ticks;
    ok(rate > BURN_BASE * 0.55 && rate < BURN_BASE * 1.55,
      `A5: the unprotected burn rate is ${(rate * 100).toFixed(1)}% over ${bare.ticks} cooks — the `
      + `catalogue rate at the required level is ${(BURN_BASE * 100).toFixed(0)}%`);
    ok(kitted.produced > bare.produced,
      `A5: the protected span produced ${kitted.produced} against ${bare.produced} — the relief is `
      + 'not turning into output');

    // …and DELETING the rung brings the burns back. The fail-closed direction,
    // proven by removal rather than by never adding.
    await db.query(`delete from public.player_progress where user_id=$1 and key='room:kitchen'`, [USER]);
    const stripped = cook(db, { recipeId: BURN_RECIPE.id, envelope: await perksOf(db),
      cookingLevel: BURN_RECIPE.req, ticksWanted: 400 });
    ok(stripped.burnt === bare.burnt,
      `A5: with the Kitchen row deleted the span burnt ${stripped.burnt}, expected the bare `
      + `${bare.burnt} — an absent row must mean FULL burn, byte for byte`);
  }

  // ── A6 · THE TWO SHAPES DO NOT LEAK INTO EACH OTHER ──────────────────
  {
    await grantRoom(db, 'kitchen', 3);
    await grantRecipe(db, gatedScroll);
    const env = await perksOf(db);

    /* The seam's own answer, asserted directly rather than only through
       hr_perks_of's prefix filters. Those filters would hide a recipe row
       today — which is exactly why asserting only the envelope proved nothing:
       the first draft's "forward the recipe namespace" mutation sailed through
       every envelope check. The exclusion is a property of hr_unlock_levels, so
       it is asserted there. */
    const seamRows = await db.query(
      'select unlock_id, level from public.hr_unlock_levels($1::uuid, 0)', [USER]);
    const ids = seamRows.rows.map((r) => r.unlock_id);
    ok(!ids.some((i) => i.startsWith('recipe:')),
      `A6: hr_unlock_levels forwarded a recipe unlock into the PERK seam (${ids.join(', ')}). It is `
      + 'a gate, not a magnitude; src/core/perks.js drops an unknown room silently, so the bug '
      + 'would stay invisible until a scroll id collided with a room id.');
    ok(ids.includes('room:kitchen'),
      `A6 CONTROL: the seam returned ${ids.join(', ') || '(nothing)'} — without the Kitchen in it, `
      + 'the absence of recipes above is "the seam returns nothing"');

    ok(!(gatedScroll in (env.rooms || {})) && !(`recipe:${gatedScroll}` in (env.rooms || {})),
      `A6: a recipe unlock leaked into the room map: ${JSON.stringify(env.rooms)}. src/core/perks.js `
      + 'drops an unknown room silently, so the bug would stay invisible until a scroll id collided '
      + 'with a room id.');
    ok(!(gatedScroll in (env.plots || {})), 'A6: a recipe unlock leaked into the plot map');
    ok(Object.keys(env.rooms || {}).length === 1,
      `A6 CONTROL: rooms reads ${JSON.stringify(env.rooms)} — expected exactly the Kitchen, so the `
      + 'absence above is not "the seam returns nothing"');
    ok(env.sources?.recipes,
      'A6: the honesty census does not declare where recipes come from — a zero-recipe night would '
      + 'be unexplainable from outside');
  }

  // ── A7 · THE MERGE-RULE PIN, BOTH DIRECTIONS, THROUGH THE GUARD ──────
  // A level filed as a flag gets hr_apply's additive merge; a recipe filed as
  // an unlock puts itself beyond hr_apply's reach. Both are refused, and the
  // refusal is check_violation so hr_apply answers bad_delta rather than 500.
  {
    const refused = async (sql, params) => {
      try { await db.query(sql, params); return null; }
      catch (e) { return String(e?.message || e); }
    };
    const asFlag = await refused(
      `insert into public.player_progress (user_id, slot, kind, key, period_key, value)
       values ($1,0,'flag','room:kitchen','',1)`, [USER]);
    ok(asFlag && /unlock_wrong_kind/.test(asFlag),
      `A7: room:kitchen was accepted as kind='flag' (${asFlag}). It would then merge ADDITIVELY `
      + 'through hr_apply and two cheap rungs would buy an expensive one.');
    const asUnlock = await refused(
      `insert into public.player_progress (user_id, slot, kind, key, period_key, value)
       values ($1,0,'unlock',$2,'',1)`, [USER, `recipe:${gatedScroll}`]);
    ok(asUnlock && /unlock_wrong_kind/.test(asUnlock),
      `A7: a recipe was accepted as kind='unlock' (${asUnlock}). hr_apply cannot write that kind, `
      + 'so the engine could never grant the scroll it rolled.');
    const unknown = await refused(
      `insert into public.player_progress (user_id, slot, kind, key, period_key, value)
       values ($1,0,'unlock','room:not_a_real_room','',1)`, [USER]);
    ok(unknown && /unknown_unlock/.test(unknown),
      `A7: an uncatalogued unlock id was accepted (${unknown})`);
    // CONTROL — an ordinary permanent flag row is untouched by all of this.
    const control = await refused(
      `insert into public.player_progress (user_id, slot, kind, key, period_key, value)
       values ($1,0,'flag','tutorial_done','',1)`, [USER]);
    ok(control === null,
      `A7 CONTROL: the guard refused an ordinary flag row (${control}) — it is refusing everything `
      + 'and the three refusals above prove nothing');
  }

  // ── A8 · hr_apply CANNOT WRITE A LEVEL — with the flag write as control ──
  {
    const v = await db.query(
      'select version from public.player_state where user_id=$1 and slot=0', [USER]);
    const r = await db.query(
      'select public.hr_apply($1::uuid,0,$2::bigint,gen_random_uuid(),$3::text::jsonb) as r',
      [USER, v.rows[0].version, JSON.stringify({
        progress: [{ kind: 'unlock', key: 'room:kitchen', add: 1 }],
        journal: { kind: 'accrue', intent: 'unlock:probe' },
      })]);
    const out = r.rows[0].r;
    ok(out?.ok !== true,
      `A8: hr_apply APPLIED a kind='unlock' progress op (${JSON.stringify(out)}). Its merge is `
      + '`value = value + add`, so a player could buy rung 1 twice and stand in rung 2.');
    ok(out?.error === 'bad_progress_kind',
      `A8: hr_apply refused the unlock op with ${JSON.stringify(out)} — expected bad_progress_kind. `
      + 'A different refusal means the protection is accidental.');
    // The control is A3(ii): the SAME call shape with kind='flag' succeeded.
  }

  // ── A8b · TWO MORE WAYS THE GATE COULD FAIL OPEN ─────────────────────
  // Both found by --mutate against the first draft of this file, which is the
  // only honest reason to add an assertion.
  {
    // (i) A ZERO-VALUED FLAG ROW IS NOT AN UNLOCK. `value` carries the count of
    //     scrolls read; a row at 0 is a row somebody created without granting
    //     anything (a claim reset, a botched migration), and reading it as
    //     unlocked would open the gate for free.
    const other = GATED.map((id) => RECIPE_INDEX[id].recipe.gated)
      .find((s) => s !== gatedScroll);
    await db.query(
      `insert into public.player_progress (user_id, slot, kind, key, period_key, value)
       values ($1,0,'flag',$2,'',0)
       on conflict (user_id, slot, kind, key, period_key) do update set value = 0`,
      [USER, `recipe:${other}`]);
    const env = await perksOf(db);
    ok(!(other in (env.unlockedRecipes || {})),
      `A8b(i): a recipe row at value 0 reads as UNLOCKED (${JSON.stringify(env.unlockedRecipes)}). `
      + 'An absent grant and a granted-then-zeroed grant are the same fact, and neither opens a gate.');
    ok(env.unlockedRecipes?.[gatedScroll] === true,
      'A8b(i) CONTROL: the genuinely granted scroll stopped reading as unlocked, so the absence '
      + 'above is not "the projection returns nothing"');
    await db.query(
      `delete from public.player_progress where user_id=$1 and key=$2`, [USER, `recipe:${other}`]);

    // (ii) A DATABASE THAT PREDATES THIS MIGRATION. hr_perks_of then returns an
    //      envelope with NO unlockedRecipes key at all, and the forwarding
    //      adapter must read that as LOCKED — never as "unknown, so allow".
    //      This is the degrade path index.ts actually takes if the Edge deploy
    //      lands before the migration is applied.
    const old = { ...(await perksOf(db)) };
    delete old.unlockedRecipes;
    const span = cook(db, { recipeId: gatedId, envelope: old, cookingLevel: 99 });
    ok(span.stoppedBy === STOP_REASON.GATE && span.ticks === 0,
      `A8b(ii) FAIL-OPEN: an envelope with NO unlockedRecipes key ran ${span.ticks} ticks and `
      + `stopped with ${span.stoppedBy}. A database that predates this migration must LOCK every `
      + 'gated recipe, not unlock them.');
  }

  // ── A9 · NEITHER FUNCTION IS CLIENT-REACHABLE ────────────────────────
  {
    const acl = await db.query(`
      select p.proname,
             has_function_privilege('authenticated', p.oid, 'execute') as auth_can,
             has_function_privilege('anon', p.oid, 'execute')          as anon_can,
             has_function_privilege('hr_engine', p.oid, 'execute')     as eng_can
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname in ('hr_perks_of','hr_unlock_levels','hr_unlock_guard')`);
    ok(acl.rows.length === 3, `A9: expected 3 functions, found ${acl.rows.length}`);
    for (const r of acl.rows) {
      ok(r.auth_can === false, `A9: ${r.proname} is executable by authenticated`);
      ok(r.anon_can === false, `A9: ${r.proname} is executable by anon`);
    }
    const seam = acl.rows.find((r) => r.proname === 'hr_unlock_levels');
    ok(seam?.eng_can === false,
      'A9: hr_unlock_levels is executable by hr_engine — a second, unfiltered read path over every '
      + 'character\'s unlocks');
    ok(acl.rows.find((r) => r.proname === 'hr_perks_of')?.eng_can === true,
      'A9: hr_perks_of is NOT executable by hr_engine — every night would price at zero perks AND '
      + 'zero recipes');
    const w = await db.query(
      `select count(*)::int n from pg_policies
        where schemaname='public' and tablename='player_progress' and cmd <> 'SELECT'`);
    ok(w.rows[0].n === 0,
      `A9: player_progress has ${w.rows[0].n} non-SELECT policies — a client-writable progress row `
      + 'is a client-authored recipe book');
  }

  await db.close?.();
}

// ════════════════════════════════════════════════════════════════════════
// MUTATION — every block above must be able to go red.
const MIG = '2026-08-16-artisan-progress-model.sql';
const CAT = '2026-08-16-unlocks.generated.sql';
const p = (file, find, replace) => new Map([[file, [[find, replace]]]]);

/* Turn §8's behavioural block into a no-op without touching §0 or §7: a plain
   `return` before its subtransaction ends the DO block. Used by M11/M12 below
   to strip the migration's own defence and leave this file as the only one. */
const SILENCE_8_FIND = '  begin  -- ── SUBTRANSACTION, rolled back ─';
const SILENCE_8_REPLACE = '  return;\n  begin  -- ── SUBTRANSACTION, rolled back ─';

const MUTATIONS = [
  {
    /* ⚠ The anchor carries the NEXT line too. `and u.progress_kind = pp.kind`
       appears twice in the file — once in §4's seam and once in §5's derived
       recipe projection — and an anchor that matches twice is a harness error
       reported as a caught mutation, which is the worst of both. */
    name: 'M1 hr_unlock_levels reverts to the perk-channel default (kind=flag)',
    patches: p(MIG, "     and u.progress_kind = pp.kind\n   where pp.user_id    = p_user",
      "     and pp.kind = 'flag'\n   where pp.user_id    = p_user"),
  },
  {
    name: 'M2 the recipe projection ignores the value (a 0 row unlocks)',
    patches: p(MIG, "     and pp.value  > 0;\n", "     and pp.value  >= 0;\n"),
  },
  {
    name: 'M3 hr_perks_of returns unlockedRecipes empty always',
    patches: p(MIG, "    'unlockedRecipes', coalesce(v_recipes, '{}'::jsonb),",
      "    'unlockedRecipes', '{}'::jsonb,"),
  },
  {
    name: 'M4 the guard drops the merge-rule pin',
    patches: p(MIG, '  if new.kind is distinct from u.progress_kind then',
      '  if false and new.kind is distinct from u.progress_kind then'),
  },
  {
    name: 'M5 the guard drops the monotonic check',
    patches: p(MIG, "  if tg_op = 'UPDATE' and new.value < old.value then",
      "  if false and tg_op = 'UPDATE' and new.value < old.value then"),
  },
  {
    name: 'M6 the guard drops the rung-ladder check',
    patches: p(MIG, '  if u.rungs is not null and not (new.value::int = any (u.rungs)) then',
      '  if false and u.rungs is not null and not (new.value::int = any (u.rungs)) then'),
  },
  {
    name: 'M7 the guard accepts an uncatalogued unlock id',
    patches: p(MIG, "    if new.kind = 'unlock' then\n      raise exception 'unknown_unlock: %', new.key",
      "    if false then\n      raise exception 'unknown_unlock: %', new.key"),
  },
  {
    name: 'M8 the seam forwards the recipe namespace into the perk maps',
    patches: p(MIG, "     and u.namespace in ('room', 'plot', 'property')",
      "     and u.namespace in ('room', 'plot', 'property', 'recipe')"),
  },
  {
    name: 'M9 the catalogue files recipe unlocks as levels, not flags',
    patches: p(CAT, "('recipe:alpha_pattern', 'recipe', 'flag', 'flag', null, null)",
      "('recipe:alpha_pattern', 'recipe', 'max', 'unlock', 1, array[1]::int[])"),
  },
  { name: 'M10 the forwarding adapter defaults an absent map to ALL-UNLOCKED', adapter: true },

  /* ── M11/M12 — THE SAME TWO DEFECTS, WITH THE MIGRATION'S OWN §8 SILENCED.
     M1 and M3 above went RED on "THE REPO CANNOT REBUILD THE DATABASE", i.e.
     the migration's own behavioural self-check refused to install. That is the
     right primary defence and it is loud — but it means the JS blocks in THIS
     file were never reached, so those blocks are unproven against exactly the
     two defects that would silently zero the whole channel. Neutralising §8
     (an early `return` before its subtransaction; §0 and §7 still run) leaves
     this guard as the only line of defence, which is what it has to be on the
     day somebody edits the migration and its self-check together. */
  {
    name: 'M11 = M1 with the migration\'s §8 self-check silenced (JS must catch it alone)',
    patches: new Map([[MIG, [
      ["     and u.progress_kind = pp.kind\n   where pp.user_id    = p_user",
        "     and pp.kind = 'flag'\n   where pp.user_id    = p_user"],
      [SILENCE_8_FIND, SILENCE_8_REPLACE],
    ]]]),
  },
  {
    name: 'M12 = M3 with the migration\'s §8 self-check silenced (JS must catch it alone)',
    patches: new Map([[MIG, [
      ["    'unlockedRecipes', coalesce(v_recipes, '{}'::jsonb),",
        "    'unlockedRecipes', '{}'::jsonb,"],
      [SILENCE_8_FIND, SILENCE_8_REPLACE],
    ]]]),
  },
];

async function mutate() {
  const escapes = [];
  const realForward = forwardEnvelope;
  for (const m of MUTATIONS) {
    problems = [];
    if (m.adapter) {
      // eslint-disable-next-line no-func-assign
      forwardEnvelope = (env) => {
        const perks = (env && env.ok === true) ? env : null;
        const all = {};
        for (const id of GATED) all[RECIPE_INDEX[id].recipe.gated] = true;
        return { perks, unlockedRecipes: (perks && perks.unlockedRecipes) || all };
      };
    }
    try {
      await run(m.patches);
    } catch (e) {
      /* A mutation that makes the MIGRATION refuse to install is the migration
         defending itself — that counts as caught, and loudly. */
      problems.push(`refused: ${String(e?.message || e).split('\n')[0]}`);
    } finally {
      // eslint-disable-next-line no-func-assign
      if (m.adapter) forwardEnvelope = realForward;
    }
    const caught = problems.length > 0;
    console.log(`  ${caught ? 'RED  ' : 'GREEN'}  ${m.name}${caught ? ` (${problems.length})` : ''}`);
    if (caught) console.log(`         first: ${problems[0]}`);
    else escapes.push(m.name);
  }
  problems = escapes.map((n) => `MUTATION ESCAPED — the guard did not see: ${n}`);
  return escapes.length === 0;
}

export async function artisanProgressGuard() {
  problems = [];
  try { await run(null); }
  catch (e) { problems.push(`artisan progress model guard failed to run — ${e?.message || e}`); }
  return problems.slice();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--mutate')) {
    console.log('artisan progress model — mutation run (every line must read RED):');
    const clean = await mutate();
    if (!clean) { for (const q of problems) console.log('  x ' + q); process.exit(1); }
    console.log(`All ${MUTATIONS.length} planted defects were caught.`);
    process.exit(0);
  }
  const ps = await artisanProgressGuard();
  if (ps.length) {
    console.log('artisan progress model guard — FAILED:');
    for (const q of ps) console.log('  x ' + q);
    process.exit(1);
  }
  console.log('Artisan progress model guard — a recipe row opens the gate and its deletion closes it; '
    + 'a Kitchen rung cooks a span with 0 burns and its deletion restores the catalogue rate.');
}
