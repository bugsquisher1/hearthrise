// ════════════════════════════════════════════════════════════════════════
// tests/dungeon-marketability.mjs — THE DUNGEON-REWARD MARKETABILITY DRIFT GUARD
//
// docs/design/dungeon-settlement.md + Designer ruling 2026-09-05: the dungeon
// economy's marketability is a DECIDED shape, and a silent flip of any item's
// `bop` flag would change what crosses between players — so it is pinned here BY
// VALUE, both directions, and a future edit that flips one fails the build:
//
//   • dungeon_scrip + the six entry KEYS are BOUND: v:0, bop:true. They are the
//     currency and the run gate; they must never become tradeable (a market for
//     keys/scrip would make the run economy a cross-player faucet).
//   • the boss-weapon spoils sold at the Quartermaster are BoP (bop:true).
//   • the housing BLUEPRINTS and the farm_deed stay TRADEABLE (bop falsy, v>0) —
//     Tyler b268, explicitly: dungeon-runners sell blueprints on the gold-conserved,
//     taxed market. That is a SINK, not a faucet (Designer-verified), so it must
//     NOT be flipped to BoP either.
//   • every Quartermaster offer's item exists in ITEMS and every price is a
//     positive integer (a spend is never free or negative).
//
// The ruling said "the six blueprints"; the DATA carries EIGHT (kitchen / forge /
// library / trophy × t2/t3). This guard binds the actual authored set, both
// directions, so neither a new blueprint nor a removed one drifts unnoticed.
//
// Run GREEN:  node tests/dungeon-marketability.mjs
// Prove RED:  node tests/dungeon-marketability.mjs --selftest   (plants each flip)
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { ITEMS } from '../src/data/items.js';
import { QM_STOCK } from '../src/data/dungeons.js';

// The DECIDED marketability, pinned BY VALUE.
const BOUND = ['dungeon_scrip', 'bone_key', 'goblin_seal', 'arcane_tome',
  'obsidian_sigil', 'void_fragment', 'dragonsbane_key'];               // v:0, bop:true
const BOP_WEAPONS = ['wartusk_cleaver', 'whispering_codex', 'ashcrown_greatsword',
  'voidmaw_scepter', 'dragonfang_pike'];                                // bop:true
const TRADEABLE = ['farm_deed',
  'kitchen_blueprint_t2', 'kitchen_blueprint_t3', 'forge_blueprint_t2', 'forge_blueprint_t3',
  'library_blueprint_t2', 'library_blueprint_t3', 'trophy_blueprint_t2', 'trophy_blueprint_t3']; // bop falsy, v>0

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

/** Assert the marketability shape against a given ITEMS/QM_STOCK pair. */
function check(items, qm) {
  for (const id of BOUND) {
    const it = items[id];
    ok(it, `${id} must exist in ITEMS`);
    if (!it) continue;
    ok(it.bop === true, `${id} must be bop:true (currency/key, never tradeable) — got ${it.bop}`);
    ok(it.v === 0, `${id} must be v:0 — got ${it.v}`);
  }
  for (const id of BOP_WEAPONS) {
    const it = items[id];
    ok(it, `${id} must exist in ITEMS`);
    if (!it) continue;
    ok(it.bop === true, `${id} (boss-weapon spoil) must be bop:true — got ${it.bop}`);
  }
  for (const id of TRADEABLE) {
    const it = items[id];
    ok(it, `${id} must exist in ITEMS`);
    if (!it) continue;
    ok(!it.bop, `${id} must stay TRADEABLE (bop falsy — Tyler b268) — got bop:${it.bop}`);
    ok(typeof it.v === 'number' && it.v > 0, `${id} must have a positive market value v — got ${it.v}`);
  }
  // Every Quartermaster offer's item exists and its price is a positive int.
  const seen = new Set();
  for (const o of qm) {
    ok(o && typeof o.id === 'string', `QM offer has a string id (got ${JSON.stringify(o)})`);
    ok(!seen.has(o.id), `QM offer ${o && o.id} appears once (it is the PK)`);
    seen.add(o && o.id);
    ok(items[o.id], `QM offer ${o && o.id} is a real ITEMS id`);
    ok(Number.isInteger(o.scrip) && o.scrip >= 1, `QM offer ${o && o.id} scrip is a positive int — got ${o && o.scrip}`);
  }
  // Every BOP_WEAPON and every TRADEABLE blueprint is actually sold by the QM (so
  // this guard's pinned set stays tied to the real shop, not a stale list).
  for (const id of [...BOP_WEAPONS, ...TRADEABLE.filter((x) => x !== 'farm_deed')]) {
    ok(seen.has(id), `${id} should be a Quartermaster offer (pinned set drifted from QM_STOCK)`);
  }
}

// deep-ish clone so a --selftest mutation cannot leak into another arm.
const clone = (items) => Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { ...v }]));

/* ── THE MUTATION CATALOGUE (data flips this guard must catch) ─────────────── */
const MUTATIONS = {
  scrip_made_tradeable: (items) => { items.dungeon_scrip.bop = false; },
  key_made_tradeable: (items) => { items.bone_key.bop = false; },
  scrip_given_value: (items) => { items.dungeon_scrip.v = 100; },
  blueprint_made_bop: (items) => { items.kitchen_blueprint_t2.bop = true; },
  deed_made_bop: (items) => { items.farm_deed.bop = true; },
  weapon_made_tradeable: (items) => { items.dragonfang_pike.bop = false; },
};

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('dungeon-marketability --selftest: each flip must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const saveFail = failed; failed = 0;
    const mutated = clone(ITEMS);
    MUTATIONS[name](mutated);
    check(mutated, QM_STOCK);
    const wentRed = failed > 0;
    failed = saveFail;
    if (wentRed) console.log(`  ${name}: RED`);
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch it`); }
  }
  if (bad) { console.error(`\n${bad} flip(s) not caught — the guard is not proving what it claims.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} flips caught. The guard is non-vacuous.`);
  process.exit(0);
} else {
  check(ITEMS, QM_STOCK);
  if (failed) { console.error(`\ndungeon-marketability: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('dungeon-marketability: all assertions passed (scrip+6 keys v:0/bop:true, 5 boss weapons bop, '
    + '8 blueprints + farm_deed tradeable, every QM offer priced + real).');
  process.exit(0);
}
