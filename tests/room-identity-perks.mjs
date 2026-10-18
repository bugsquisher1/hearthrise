// ============================================================================
// tests/room-identity-perks.mjs — A ROOM SELLS ITS IDENTITY FROM RUNG 1.
//
// Designer ruling 1b (2026-09-07): Smithing and Crafting are no longer gated
// on the Forge/Workshop, so the rooms must be worth buying on their own. Each
// one's IDENTITY MECHANIC — the Forge's extra bar (`yield_smithing`), the
// Workshop's free craft (`craftSave`) — now pays from the rung a player can
// actually afford, laddered 1/2/4/6/8% on the Garden's shape.
//
// The property under test is not "the table contains 0.01". It is that the
// magnitude ARRIVES: a player who owns rung 1 gets a non-zero proc chance
// through the same `src/core/perks.js` both the client and hr-accrue read.
// Before b521 a rung-1 Forge stacked to exactly 0 and the room's whole
// selling point was invisible until the tier-3 rung most accounts never see.
//
// Also pinned: the TOP of each ladder stays 8% (the b227 power budget the
// in-page suite asserts is untouched by this rebase) and no rung is DEVALUED
// relative to the rung below it — a ladder that dips is a reward for
// upgrading that takes something away.
//
// Run standalone:  node tests/room-identity-perks.mjs
// Wired into tests/run-smoke.mjs as a preflight (roomIdentityPerksGuard).
// ============================================================================
import { pathToFileURL } from 'node:url';
import { normalisePerkState, permanentBonus } from '../src/core/perks.js';
import { isMain } from './_is-main.mjs';

/* The ruling's tables, restated as literals. They are NOT derived from
   ROOM_PERKS — a ladder read out of the file it is grading proves nothing. */
const LADDERS = {
  workshop: ['craftSave',      [0.01, 0.02, 0.04, 0.06, 0.08]],
};
/* The Forge's extra bar (yield_smithing) left with every other home-granted
   resource advantage (Master Design Reference §9, 2026-10-14): no Forge rung
   may pay it, and no room may pay a yield proc at all. */
const RETIRED = ['yield_smithing', 'yield_cooking', 'farmYield', 'allXP', 'combatXP'];

export async function roomIdentityPerksGuard() {
  const problems = [];
  const fail = (m) => problems.push('room-identity-perks: ' + m);
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  for (const id of Object.keys(LADDERS)) {
    const [key, want] = LADDERS[id];
    for (let lv = 1; lv <= want.length; lv++) {
      /* Through the REAL adapter, from the shape the server sends: a raw perk
         state, normalised, then stacked. */
      const state = normalisePerkState({ rooms: { [id]: lv } });
      const got = permanentBonus(key, state);
      if (!near(got, want[lv - 1])) {
        fail(`${id} L${lv} should stack ${want[lv - 1]} of ${key}, stacks ${got}`);
      }
      if (lv > 1 && got + 1e-9 < permanentBonus(key, normalisePerkState({ rooms: { [id]: lv - 1 } }))) {
        fail(`${id} L${lv} pays LESS ${key} than L${lv - 1} — an upgrade may never take power away`);
      }
    }
    // The headline: rung 1 is not zero. This is the whole ruling in one line.
    const one = permanentBonus(key, normalisePerkState({ rooms: { [id]: 1 } }));
    if (!(one > 0)) fail(`${id} rung 1 pays no ${key} at all — the room's identity mechanic is unreachable`);
    // And the ceiling did not move.
    const top = permanentBonus(key, normalisePerkState({ rooms: { [id]: want.length } }));
    if (!near(top, 0.08)) fail(`${id} tops out at ${top} of ${key} — the b227 power budget says 0.08`);
  }

  /* A room may not pay a key it does not own: craftSave is the Workshop's and
     yield_smithing is the Forge's, and a copy-paste that crossed them would
     otherwise read green above. */
  if (permanentBonus('craftSave', normalisePerkState({ rooms: { forge: 5 } })) !== 0) {
    fail('the Forge pays craftSave — the crafting bench\'s mechanic is not the forge\'s to sell');
  }
  for (const k of RETIRED) {
    for (const id of ['forge', 'kitchen', 'garden', 'library', 'trophy', 'workshop', 'cellar', 'shrine']) {
      const v = permanentBonus(k, normalisePerkState({ rooms: { [id]: 5 } }));
      if (v !== 0) fail(`${id} rung 5 pays ${v} ${k} — a home never grants XP or a resource advantage`);
    }
  }

  return problems;
}

if (isMain(import.meta.url)) {
  const ps = await roomIdentityPerksGuard();
  if (ps.length) {
    console.log('room identity perks — FAILED:');
    for (const p of ps) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('Room identity perks — the Workshop\'s free craft reaches a rung-1 owner through '
    + 'src/core/perks.js, the 8% ceiling is unmoved, and no room pays XP or a yield proc.');
}
