#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/sec-bestiary-trophy-proofs.mjs — SECURITY REVIEW PROOFS for
// lane/m7-bestiary-backend (docs/planning/SEC_BESTIARY_TROPHY_2026-09-22.md).
//
// ⚠ THIS GUARD IS EXPECTED TO BE **RED** ON THE LANE AS REVIEWED. It is the
//   executable half of two findings; it is not a ratchet and it is not
//   registered in .github/workflows/smoke.yml. It goes green when the lane
//   applies the required changes, and at that point the lane's own author
//   should fold these two assertions into tests/bestiary-trophy.mjs and delete
//   this file. The Security role does not fix lane code.
//
//   S-1  hr_trophy_of's stage regex admits a digit string wider than int4, so
//        the `::int` in its target list raises 22003 — on the READ path that
//        runs on every accrual, and supabase/functions/hr-accrue/index.ts
//        degrades on 42883 ONLY, so a 22003 takes the whole accrual read down.
//        The file's own comment defends the 22P02 half of exactly this class.
//
//   S-2  the trophy DAMAGE factor is unreachable through `playerCombatRolls`,
//        which is where `maxHit` is actually rolled. `weaknessInfo` resolves
//        the trophy off `monsterId`, and neither caller of `playerRolls(m)`
//        passes one (accrual.js `playerRolls`, core-bridge.js `combatCtx`) —
//        measured: 0 of 108 roster rows carry `.id`. So flipping
//        TROPHY_DAMAGE_ARM_ENABLED alone states an effect that pays nothing,
//        which is what tests/arm-flag-honesty.mjs exists to prevent.
//
// Run: node tests/sec-bestiary-trophy-proofs.mjs
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { MONSTERS } from '../src/data/monsters.js';
import { playerCombatRolls, weaknessInfo } from '../src/core/combat.js';
import { MAX_TROPHY_STAGE } from '../src/data/bestiary.js';

const fail = [];
const say = (id, msg) => fail.push(`${id}  ${msg}`);

// ── S-1 — hr_trophy_of overflows on an over-range stage tail ───────────────
// Executed against a real PostgreSQL, using the projection body LIFTED OUT OF
// THE MIGRATION rather than restated, so the proof cannot drift from the file.
async function s1() {
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch { const e = new Error('@electric-sql/pglite is not installed'); e.harness = true; throw e; }

  const src = (await readFile(
    new URL('../supabase/migrations/2026-09-22-trophy-claim.sql', import.meta.url), 'utf8'))
    .replace(/\r\n/g, '\n');
  const m = src.match(/create or replace function public\.hr_trophy_of[\s\S]*?\$body\$([\s\S]*?)\$body\$/);
  if (!m) { const e = new Error('hr_trophy_of body not found in the migration'); e.harness = true; throw e; }
  // The body verbatim, re-pointed at a bare probe table: the predicate set and
  // the `::int` in the target list are the migration's own text.
  const body = m[1].replace(/public\.player_progress/g, 'pp');

  const db = await new PGlite();
  await db.exec(`create table pp(user_id uuid, slot int, kind text, key text,
                                 period_key text, value int, state text);
    create function tof(p_user uuid, p_slot int)
      returns table(monster_id text, stage int) language sql stable as $b$${body}$b$;`);
  const u = '00000000-0000-4000-8000-000000000001';
  await db.query(`insert into pp values ($1,0,'collection','trophy:goblin:1','',1,'claimed')`, [u]);
  // The row a future writer leaves behind. player_progress's own CHECK admits it
  // (1..64 chars) and nothing in the schema forbids the prefix.
  await db.query(`insert into pp values ($1,0,'collection','trophy:goblin:99999999999','',1,'claimed')`, [u]);
  try {
    await db.query(`select * from tof($1,0)`, [u]);
    say('S-1', 'the projection tolerated an over-range stage tail — finding closed, delete this arm');
  } catch (e) {
    say('S-1', `hr_trophy_of raised ${e.code || '?'} (${e.message}) on an over-range stage tail. `
      + `The read runs on every accrual and index.ts degrades on 42883 only. `
      + `Bound the regex to the ladder, e.g. ~ '^[1-9][0-9]{0,2}$'.`);
  }
  await db.close?.();
}

// ── S-2 — the Fight screen and the loot preview disagree about the DROP rate ─
// `playerCombatRolls` resolves the trophy off `ctx.monsterId`; neither caller
// passes one (accrual.js `playerRolls(m)`, core-bridge.js `combatCtx`, which
// omits it deliberately), and 0 of 108 roster rows carry `.id`. legacy.js's
// `getWeaknessInfo` DOES pass it. So `getPlayerCombatRolls(m).weak.dropMult`
// (the fight screen) and `getWeaknessInfo(m).dropMult` (the loot preview) answer
// twice for a character holding a trophy — which is the exact equality CHARM-2
// arm 3 asserts to 1e-9 in src/features/smoke/hunt-raids-and-screens.js:2049.
// S-3 is the same root cause on the dormant damage half.
function s2() {
  const withId = Object.keys(MONSTERS).filter((k) => typeof MONSTERS[k].id === 'string');
  const id = Object.keys(MONSTERS)[0];
  const idx = Object.create(null);
  idx[id] = MAX_TROPHY_STAGE;              // a top-rung trophy, the best case
  const eq = { weaponType: 'sword' };

  if (withId.length) {
    say('S-2', `${withId.length} roster row(s) now carry .id \u2014 re-derive both arms`);
  }

  // The loot preview's call (legacy.js getWeaknessInfo passes the id).
  const preview = weaknessInfo(MONSTERS[id], eq, null, idx, id);
  // The fight screen's call. `playerCombatRolls` builds `weak` itself from a ctx
  // that carries `trophies` and no `monsterId`.
  const rolls = playerCombatRolls(MONSTERS[id], {
    eq, equipment: {}, items: {}, skills: {}, trophies: idx,
  });
  if (!rolls || !rolls.weak) {
    say('S-2', 'playerCombatRolls no longer returns `weak` \u2014 harness drift, this arm is vacuous');
    return;
  }
  if (preview.trophyStage !== MAX_TROPHY_STAGE) {
    say('S-2', 'weaknessInfo did not resolve a top-rung trophy even WITH the id \u2014 harness drift');
    return;
  }
  if (Math.abs(rolls.weak.dropMult - preview.dropMult) > 1e-9) {
    say('S-2', `the fight screen quotes dropMult ${rolls.weak.dropMult} while the loot preview quotes `
      + `${preview.dropMult} for the same kill at stage ${MAX_TROPHY_STAGE} (trophyStage `
      + `${rolls.weak.trophyStage} vs ${preview.trophyStage}). The server pays the PREVIEW's number `
      + '(combat-sim.js resolveKill calls ctx.weakness(m, id)), so the fight screen under-states. '
      + 'src/features/smoke/hunt-raids-and-screens.js:2049 asserts these two equal to 1e-9, so this '
      + 'is a latent in-page RED that arms itself the first time a player reaches Stalker. '
      + 'Pass monsterId at src/legacy.js:2780 and in accrual.js playerRolls(m).');
  } else {
    say('S-2', 'the two callers agree \u2014 finding closed, delete this arm');
  }

  // ── S-3 — and the same gap makes the damage arm unreachable ──────────────
  if (rolls.weak.trophyStage !== MAX_TROPHY_STAGE) {
    say('S-3', 'maxHit is rolled from ctx.playerRolls(m) (src/core/combat-sim.js:405) and that path '
      + 'resolves trophy stage 0, so flipping TROPHY_DAMAGE_ARM_ENABLED states an effect that pays '
      + 'nothing \u2014 what tests/arm-flag-honesty.mjs exists to prevent. '
      + 'tests/bestiary-trophy.mjs T5 cannot see it: it calls weaknessInfo directly with the id. '
      + 'BESTIARY_LADDER.md \u00a73.1\u2019s "one-line flip" is therefore wrong.');
  }
}

const t0 = Date.now();
await s1();
s2();
if (fail.length) {
  console.error('sec-bestiary-trophy-proofs: RED — the reviewed lane reproduces every finding below\n');
  for (const f of fail) console.error('  ✗ ' + f + '\n');
  console.error(`(${Date.now() - t0}ms) See docs/planning/SEC_BESTIARY_TROPHY_2026-09-22.md.`);
  process.exit(1);
}
console.log('sec-bestiary-trophy-proofs: green — both findings are closed; fold into '
  + 'tests/bestiary-trophy.mjs and delete this file.');
