// ════════════════════════════════════════════════════════════════════════
// tests/hearthfind-roll.mjs — THE HEARTHFIND's ENGINE half + THE MINT GUARD.
//
// The SQL half (grant, journal, broadcast, clamps, receipt) is asserted by
// tests/hearthfind-authority.mjs against a real database. This guard asserts the
// half that lives in src/core and src/data:
//
//   ROLL-1  DETERMINISM. The same seed produces the same find at the same tick;
//           a different seed does not. That is what makes an away grant
//           auditable — given (user, slot, accrued_to) the server can re-run the
//           span and prove the roll.
//   ROLL-2  A SOURCE WITH NO ROW DRAWS NO RANDOM NUMBER. Counted, not asserted
//           by inspection. This is what keeps every pre-existing seeded replay
//           (tests/accrual-engine.mjs) byte-identical to its pre-Hearthfind self
//           for the 98 monsters and the nodes the table does not name.
//   ROLL-3  AWAY-1 PARITY, BOTH PATHS. simulateSpan is the ONE engine the live
//           tick and hr-accrue both run (AWAY-12 forbids a second). An
//           `away:true` span and an `away:false` span from the same seed and the
//           same state produce the SAME find at the SAME tick index — so a find
//           that happens while you sleep is the find that would have happened
//           had you watched.
//   ROLL-4  NOTHING SCALES IT. dropMult (weakness), dropRate (a buff) and the
//           featured multiplier move an ordinary drop and move a hearthfind NOT
//           AT ALL. The Feature Slate's "must NOT be purchasable or boostable by
//           anything paid", proven rather than commented.
//   ROLL-5  ONE ROLL SITE PER ENGINE, AND NONE OUTSIDE src/core. A second roll
//           site is how the live tick and the away replay come to disagree.
//   MINT-1..4  THE MINT GUARD. No hearthfind trophy is tradeable, vendorable, a
//           priced currency, or reachable from any OTHER faucet — no drop table,
//           no recipe output, no shop, no Quartermaster offer, no start kit. A
//           hearthfind is minted through hr_apply's hearthfind arm or not at all.
//
// ── THE MUTATION PROOF (run: node tests/hearthfind-roll.mjs --selftest) ──────
// Each mutation plants a REAL defect in an in-memory copy of the data or the
// index; --selftest demands every one turns the run RED.
//
// Run GREEN:  node tests/hearthfind-roll.mjs
// Prove RED:  node tests/hearthfind-roll.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import {
  HEARTHFIND_TABLE, HEARTHFIND_ITEMS, HEARTHFIND_ONE_IN_MIN, HEARTHFIND_ONE_IN_MAX,
} from '../src/data/hearthfind.js';
import { indexHearthfind, rollHearthfind } from '../src/core/hearthfind.js';
import { simulateSpan } from '../src/core/combat-sim.js';
import { mulberry32, rngFrom } from '../src/core/rng.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { START_INVENTORY } from '../src/data/start-kit.js';
import { DUNGEONS, QM_STOCK } from '../src/data/dungeons.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

/* A COUNTING RNG. Same contract as src/core/rng.js, plus `draws` — ROLL-2 is a
   claim about how many random numbers are consumed, and the only honest way to
   assert that is to count them. */
function countingRng(seed) {
  const next = mulberry32(seed);
  const base = rngFrom(next);
  const r = {
    draws: 0,
    next() { r.draws++; return next(); },
    int(a, b) { r.draws++; return base.int(a, b); },
    chance(p) { r.draws++; return base.chance(p); },
  };
  return r;
}

/* THE SPAN HARNESS. One monster, deterministic swings, no auto-eat, no buffs —
   everything except the RNG stream is held constant so a difference between two
   runs can only come from the seed or from the code under test. */
function span({ seed, away, monsterId, table }) {
  const m = MONSTERS[monsterId];
  const state = {
    activeMonster: monsterId, monsterHp: m.hp, monsterMaxHp: m.hp,
    playerHp: 100000, playerMaxHp: 100000, gold: 0, skills: {}, stats: {}, inventory: {},
  };
  let tick = 0;
  const finds = [];
  const ctx = {
    away, fromMs: 0, toMs: 24 * 3600000, tickMs: 2000,
    rng: countingRng(seed),
    monsters: MONSTERS, items: ITEMS,
    bonus: () => 0,
    style: 'controlled',
    activeBuffCount: 0,
    hearthfind: table === undefined ? undefined : indexHearthfind(table),
    playerRolls: () => ({ accuracy: 1, maxHit: m.hp, critChance: 0, critMult: 1 }),
    monsterRolls: () => ({ accuracy: 0, maxHit: 1 }),
    weakness: () => ({ dropMult: 1 }),
    botdFor: () => ({ killBonuses: () => ({ dropMult: 1, xpMult: 1 }) }),
    fx: {
      mark() { tick++; },
      addItem() {}, addXp() {},
      onHearthfind(f) { finds.push({ ...f, tick, kill: state.stats.kills || 0 }); },
    },
  };
  const summary = simulateSpan(state, ctx);
  return { finds, summary, draws: ctx.rng.draws, kills: state.stats.kills || 0 };
}

/* ── THE MUTATION CATALOGUE. Each returns a mutated view of the data. ────── */
const MUTATIONS = {
  band_widened: {
    why: 'a source is retuned to 1-in-500 — "the rarest thing in the game" becomes an hourly event '
       + 'and the whole feature is a common drop with a fanfare',
    table: () => HEARTHFIND_TABLE.map((r, i) => (i === 0 ? { ...r, oneIn: 500 } : r)),
  },
  trophy_tradeable: {
    why: 'a trophy becomes tradeable — the rarest event in the game turns into a second gold bridge '
       + 'on the player market, exactly what the muster_seal rule exists to prevent',
    items: (items) => ({ ...items, [HEARTHFIND_ITEMS[0]]: { ...items[HEARTHFIND_ITEMS[0]], bop: false } }),
  },
  trophy_vendorable: {
    why: 'a trophy gains a vendor value — a 1-in-6,000 roll is quietly attached to a gold faucet '
       + 'nobody balanced',
    items: (items) => ({ ...items, [HEARTHFIND_ITEMS[0]]: { ...items[HEARTHFIND_ITEMS[0]], v: 5000 } }),
  },
  second_faucet: {
    why: 'a trophy is added to a monster drop table — a hearthfind can now be minted through the '
       + 'ordinary items delta, which neither journals a hearthfind row nor broadcasts',
    monsters: (mon) => ({ ...mon, slime: { ...mon.slime,
      drops: [...mon.slime.drops, { id: HEARTHFIND_ITEMS[0], ch: 0.5 }] } }),
  },
  currency_on_allowlist: {
    why: 'a priced currency is added to the hearthfind allowlist — a lucky roll starts minting the '
       + 'premium bond, which is IAP-only by the Final Directive',
    ids: () => [...HEARTHFIND_ITEMS, 'hearth_token'],
  },
};

function view(mut) {
  const m = MUTATIONS[mut] || {};
  return {
    table: m.table ? m.table() : HEARTHFIND_TABLE,
    items: m.items ? m.items(ITEMS) : ITEMS,
    monsters: m.monsters ? m.monsters(MONSTERS) : MONSTERS,
    ids: m.ids ? m.ids() : HEARTHFIND_ITEMS,
  };
}

async function runAll(mut) {
  const V = view(mut);
  const idx = indexHearthfind(V.table);
  const rows = V.table.slice();
  const monsterRow = rows.find((r) => r.kind === 'monster');
  ok(!!monsterRow, 'SETUP: the table names no monster source, so the span tests are vacuous');

  // ── THE BAND. Asserted here as well as in the generator and the migration,
  //    because it is the one number the whole feature is made of.
  for (const r of rows) {
    ok(Number.isInteger(r.oneIn) && r.oneIn >= HEARTHFIND_ONE_IN_MIN && r.oneIn <= HEARTHFIND_ONE_IN_MAX,
      `${r.kind}:${r.id} pays 1 in ${r.oneIn}, outside the authored `
      + `[${HEARTHFIND_ONE_IN_MIN}, ${HEARTHFIND_ONE_IN_MAX}] band`);
  }

  // ── ROLL-1  DETERMINISM. ────────────────────────────────────────────────
  {
    /* The odds are deliberately shortened for the SPAN tests only — a 1-in-6,000
       roll would need a span nobody wants to simulate. The BAND is asserted
       above against the shipped table; this is a probe table, and shortening it
       here cannot make the shipped one common. */
    const probe = [{ ...monsterRow, oneIn: HEARTHFIND_ONE_IN_MIN }];
    const a = span({ seed: 12345, away: true, monsterId: monsterRow.id, table: probe });
    const b = span({ seed: 12345, away: true, monsterId: monsterRow.id, table: probe });
    ok(JSON.stringify(a.finds) === JSON.stringify(b.finds),
      `the same seed produced different finds (${JSON.stringify(a.finds)} vs ${JSON.stringify(b.finds)}) `
      + '— an away grant that cannot be re-derived cannot be audited or disputed');
    const c = span({ seed: 999, away: true, monsterId: monsterRow.id, table: probe });
    ok(JSON.stringify(a.finds) !== JSON.stringify(c.finds) || a.finds.length === 0,
      'two different seeds produced an identical find stream — the roll is not reading the RNG');
  }

  // ── ROLL-2  NO ROW, NO DRAW. ────────────────────────────────────────────
  {
    const unnamed = Object.keys(V.monsters).find((id) => !rows.some((r) => r.kind === 'monster' && r.id === id));
    ok(!!unnamed, 'SETUP: every monster is a hearthfind source, so this assertion is vacuous');
    const withTable = span({ seed: 7, away: true, monsterId: unnamed, table: V.table });
    const without = span({ seed: 7, away: true, monsterId: unnamed, table: [] });
    ok(withTable.draws === without.draws,
      `a monster with no table row consumed ${withTable.draws} draws with the table and `
      + `${without.draws} without it — adding the feature shifted the RNG stream of every existing `
      + 'seeded replay, and every pinned accrual number in the repo silently moved');
    ok(withTable.finds.length === 0, 'a monster with no table row produced a find');
    // …and the roll itself returns before touching the rng.
    const r = countingRng(1);
    ok(rollHearthfind(idx, 'monster', '__not_a_source__', r) === null && r.draws === 0,
      `rollHearthfind drew ${r.draws} random numbers for an unknown source — it must return first`);
  }

  // ── ROLL-3  AWAY-1 PARITY, BOTH PATHS. ──────────────────────────────────
  {
    const probe = [{ ...monsterRow, oneIn: HEARTHFIND_ONE_IN_MIN }];
    const awaySpan = span({ seed: 424242, away: true, monsterId: monsterRow.id, table: probe });
    const attended = span({ seed: 424242, away: false, monsterId: monsterRow.id, table: probe });
    ok(awaySpan.finds.length > 0 || attended.finds.length > 0,
      'SETUP: neither span produced a find, so the parity assertion is vacuous');
    ok(JSON.stringify(awaySpan.finds) === JSON.stringify(attended.finds),
      `the away span found ${JSON.stringify(awaySpan.finds)} and the attended replay found `
      + `${JSON.stringify(attended.finds)}. AWAY-1: one engine, one stream — a find while you sleep `
      + 'must be the find that would have happened had you watched, at the same tick.');
  }

  // ── ROLL-4  NOTHING SCALES IT. ──────────────────────────────────────────
  {
    const probe = [{ ...monsterRow, oneIn: HEARTHFIND_ONE_IN_MIN }];
    const plain = span({ seed: 31337, away: true, monsterId: monsterRow.id, table: probe });
    /* The same seed, but every drop multiplier in the game turned up as far as it
       goes: a x3 weakness, a +500% dropRate buff and a x2 featured boss. An
       ordinary drop table would pay far more; the hearthfind must be identical.
       ⚠ The comparison is on the FIND, not on the item bag — the boosted run
         legitimately drops more ordinary loot. */
    const m = MONSTERS[monsterRow.id];
    const state = {
      activeMonster: monsterRow.id, monsterHp: m.hp, monsterMaxHp: m.hp,
      playerHp: 100000, playerMaxHp: 100000, gold: 0, skills: {}, stats: {}, inventory: {},
    };
    let tick = 0; const finds = [];
    simulateSpan(state, {
      away: true, fromMs: 0, toMs: 24 * 3600000, tickMs: 2000,
      rng: countingRng(31337), monsters: MONSTERS, items: ITEMS,
      bonus: (k) => (k === 'dropRate' ? 5 : 0),
      style: 'controlled', activeBuffCount: 0,
      hearthfind: indexHearthfind(probe),
      playerRolls: () => ({ accuracy: 1, maxHit: m.hp, critChance: 0, critMult: 1 }),
      monsterRolls: () => ({ accuracy: 0, maxHit: 1 }),
      weakness: () => ({ dropMult: 3 }),
      botdFor: () => ({ killBonuses: () => ({ dropMult: 2, xpMult: 1 }) }),
      fx: { mark() { tick++; }, addItem() {}, addXp() {},
            onHearthfind(f) { finds.push({ ...f, tick, kill: state.stats.kills || 0 }); } },
    });
    ok(JSON.stringify(plain.finds) === JSON.stringify(finds),
      `a x3 weakness + a 500% dropRate buff + a x2 featured boss changed the hearthfind stream `
      + `(${JSON.stringify(plain.finds)} vs ${JSON.stringify(finds)}). A hearthfind must never be `
      + 'boostable — least of all by anything a player can pay for.');
  }

  // ── ROLL-5  ONE ROLL SITE PER ENGINE, NONE OUTSIDE src/core. ────────────
  {
    const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8').catch(() => '');
    const combat = await read('../src/core/combat-sim.js');
    const skill = await read('../src/core/skill-sim.js');
    const legacy = await read('../src/legacy.js');
    const count = (s, re) => (s.match(re) || []).length;
    ok(count(combat, /resolveHearthfind\s*\(/g) === 1,
      `combat-sim.js has ${count(combat, /resolveHearthfind\s*\(/g)} hearthfind roll sites — exactly one`);
    ok(count(skill, /resolveHearthfind\s*\(/g) === 1,
      `skill-sim.js has ${count(skill, /resolveHearthfind\s*\(/g)} hearthfind roll sites — exactly one`);
    ok(!/rollHearthfind|resolveHearthfind/.test(legacy),
      'src/legacy.js rolls a hearthfind — a client-side roll is a client-authored drop (CLAUDE.md §1) '
      + 'and a second engine (AWAY-12)');
  }

  // ── MINT-1..4  THE MINT GUARD. ──────────────────────────────────────────
  {
    for (const id of V.ids) {
      const it = V.items[id];
      ok(!!it, `${id} is on the hearthfind allowlist but is not an item`);
      if (!it) continue;
      ok(it.bop === true,
        `${id} is TRADEABLE — a hearthfind on the player market is a second gold bridge`);
      ok(Number(it.v || 0) === 0,
        `${id} has vendor value ${it.v} — a find would mint gold`);
      ok(it.tag !== 'currency' && !it.premium && !it.musterOnly,
        `${id} is a priced/earned CURRENCY — a hearthfind must never mint hearth_token, muster_seal `
        + 'or anything else with a price attached');
    }
    ok(!V.ids.includes('hearth_token') && !V.ids.includes('muster_seal')
       && !V.ids.includes('dungeon_scrip'),
      'a priced currency is on the hearthfind allowlist');

    // NO SECOND FAUCET. If any other source can mint a trophy, the ledger row
    // and the broadcast stop being implied by the item's existence.
    const faucets = [];
    for (const [mid, m] of Object.entries(V.monsters)) {
      for (const d of (m.drops || [])) if (V.ids.includes(d.id)) faucets.push(`monster drop ${mid}`);
    }
    for (const list of Object.values(ARTISAN_RECIPES)) {
      for (const r of list) if (V.ids.includes(r.out || r.id)) faucets.push(`recipe ${r.id}`);
    }
    for (const id of Object.keys(START_INVENTORY)) if (V.ids.includes(id)) faucets.push(`start kit ${id}`);
    for (const [did, d] of Object.entries(DUNGEONS)) {
      for (const l of (d.loot || [])) if (V.ids.includes(l.id)) faucets.push(`dungeon loot ${did}`);
    }
    for (const o of QM_STOCK) if (V.ids.includes(o.id)) faucets.push(`quartermaster ${o.id}`);
    ok(faucets.length === 0,
      `a hearthfind trophy is reachable from ${faucets.length} other faucet(s): ${faucets.join(', ')}. `
      + 'The hearthfind arm of hr_apply must be the ONLY door, or an item can exist with no ledger '
      + 'row and no broadcast behind it.');
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('hearthfind-roll --selftest: each mutation must turn the guard RED');
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    const save = failed; failed = 0; let threw = false;
    try { await runAll(name); } catch (e) { threw = true; console.log(`  ${name}: RED (threw: ${e.message.split('\n')[0]})`); }
    const red = failed > 0 || threw;
    failed = save;
    if (red) { if (!threw) console.log(`  ${name}: RED — ${MUTATIONS[name].why}`); }
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  if (bad) { console.error(`\n${bad} mutation(s) not caught — the guard is not proving what it claims.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
} else {
  await runAll(null);
  if (failed) { console.error(`\nhearthfind-roll: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('hearthfind-roll: all assertions passed (the roll is seeded and replayable; a source '
    + 'with no row draws no random number; an away span and an attended replay find the same trophy '
    + 'at the same tick; no drop multiplier, buff or featured boss moves it; one roll site per '
    + 'engine and none in legacy.js; no trophy is tradeable, vendorable, a currency, or reachable '
    + 'from any other faucet).');
  process.exit(0);
}
