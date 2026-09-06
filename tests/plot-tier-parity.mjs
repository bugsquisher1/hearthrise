// ════════════════════════════════════════════════════════════════════════
// tests/plot-tier-parity.mjs — THE CLIENT AND THE SERVER MAY NEVER DISAGREE
//                              ON WHAT A PLOT TIER COSTS.
//
// b510 priced the farm plot tier in GOLD behind a FARMING LEVEL, with the
// Farmer's Deed count kept as the alternative payment
// (supabase/migrations/2026-09-06-plot-tier-reachable.sql, the ruling). The
// price therefore exists in FOUR places that have to say the same thing:
//
//   1. the migration's §1 UPDATE           — what the database will charge
//   2. the migration's §4 self-check       — what the migration claims it set
//   3. src/core/farm.js PLOT_TIER_PRICES   — what the House -> Plot card QUOTES
//   4. 2026-08-22-farm-catalogues.generated.sql hr_plot_tier.deed_cost
//                                          — the deed half, GENERATED from
//                                            src/core/farm.js PLOT_TIERS
//
// A player who is quoted 500g and charged 5,000g files a bug report and is
// right to. The RPC re-reads its own catalogue under a row lock, so a lying
// client cannot STEAL anything — this guard is about the promise, not the
// exploit, and about the far worse failure where a re-price moves one copy.
//
// IT ALSO GUARDS THE RULING ITSELF, not just the arithmetic:
//   • THE TIER IS NEVER THE GATE — every tier's req_farm_level must be
//     STRICTLY BELOW the lowest CROPS[].req it unlocks, so the tier is always
//     bought slightly BEFORE the crop it enables. The 2026-09-06 outage was a
//     tier that gated content NOTHING could unlock; this is the property that
//     makes it un-reintroducible.
//   • LEVEL 1 IS FREE in both currencies (it is the starting state).
//   • The ladder rises: gold, deeds and required level all strictly increase.
//
// Text-based ON PURPOSE. It parses the four files rather than replaying the
// chain, so it costs milliseconds, needs no database and no credentials, and
// can therefore sit on every push. tests/schema-drift.mjs already proves the
// migration APPLIES; §4 of the migration proves the database ends up with
// these numbers; this proves the four AUTHORED copies agree before either runs.
//
//   node tests/plot-tier-parity.mjs             the guard
//   node tests/plot-tier-parity.mjs --selftest  9 planted defects, each caught
//                                               by its NAMED assertion, plus 2
//                                               negative controls that must
//                                               stay silent
//   node tests/plot-tier-parity.mjs --mutate    3 defects planted in the REAL
//                                               file text on disk (read-only:
//                                               mutated in memory)
//
// Exit: 0 green · 1 a real problem · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = join(ROOT, 'supabase', 'migrations', '2026-09-06-plot-tier-reachable.sql');
const GENERATED = join(ROOT, 'supabase', 'migrations', '2026-08-22-farm-catalogues.generated.sql');
const CLIENT    = join(ROOT, 'src', 'core', 'farm.js');
const GATHERING = join(ROOT, 'src', 'data', 'gathering.js');

const argv = process.argv.slice(2);
const harness = (m) => { const e = new Error(m); e.harness = true; return e; };
const fail = (name, m) => { const e = new Error(m); e.assertion = name; return e; };

// ── PARSERS ────────────────────────────────────────────────────────────────
// Each returns a plain {level: {...}} map, or throws a HARNESS error when the
// anchor it needs is not in the text at all (an unparseable file is a broken
// guard, not a failing one — the distinction the renown harness had to learn).

/** §1 of the migration: the UPDATE ... FROM (values (lv, gold, req)) tuples. */
export function parseMigrationPrices(sql) {
  const m = sql.match(/update public\.hr_plot_tier set gold_cost[\s\S]*?as v\(plot_level, gold, lv\)/);
  if (!m) throw harness('the migration §1 UPDATE ... as v(plot_level, gold, lv) block was not found');
  return tuples(m[0], 'migration §1');
}

/** §4(a) of the migration: the same tuples, restated as the self-check. */
export function parseMigrationSelfCheck(sql) {
  const m = sql.match(/for v_lv, v_gold, v_n in[\s\S]*?as t\(lv, g, r\)/);
  if (!m) throw harness('the migration §4(a) `as t(lv, g, r)` block was not found');
  return tuples(m[0], 'migration §4(a)');
}

function tuples(block, where) {
  const out = {};
  const re = /\((\d+),\s*(\d+)(?:::bigint)?,\s*(\d+)\)/g;
  let t;
  while ((t = re.exec(block))) out[+t[1]] = { gold: +t[2], farming: +t[3] };
  if (Object.keys(out).length !== 5) {
    throw harness(`${where} parsed ${Object.keys(out).length} rungs, expected 5`);
  }
  return out;
}

/** src/core/farm.js PLOT_TIER_PRICES — parsed from TEXT so --mutate can move it. */
export function parseClientPrices(js) {
  const m = js.match(/export const PLOT_TIER_PRICES = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!m) throw harness('src/core/farm.js PLOT_TIER_PRICES was not found');
  const out = {};
  const re = /(\d+):\s*Object\.freeze\(\{\s*gold:\s*(\d+),\s*deeds:\s*(\d+),\s*farming:\s*(\d+)\s*\}\)/g;
  let t;
  while ((t = re.exec(m[1]))) out[+t[1]] = { gold: +t[2], deeds: +t[3], farming: +t[4] };
  if (Object.keys(out).length !== 4) {
    throw harness(`PLOT_TIER_PRICES parsed ${Object.keys(out).length} rungs, expected 4 (tiers 2..5)`);
  }
  return out;
}

/** src/core/farm.js PLOT_TIERS[].cost — the deed price the catalogue generates from. */
export function parseClientDeeds(js) {
  const m = js.match(/export const PLOT_TIERS = \[([\s\S]*?)\n\];/);
  if (!m) throw harness('src/core/farm.js PLOT_TIERS was not found');
  const costs = [...m[1].matchAll(/cost:\s*(\d+)/g)].map((x) => +x[1]);
  if (costs.length !== 5) throw harness(`PLOT_TIERS parsed ${costs.length} costs, expected 5`);
  return costs;   // index 0 = plot level 1
}

/** The generated catalogue's deed_cost rows. */
export function parseGeneratedDeeds(sql) {
  const m = sql.match(/insert into public\.hr_plot_tier \(plot_level, deed_cost\) values([\s\S]*?);/);
  if (!m) throw harness('the generated hr_plot_tier insert was not found');
  const out = {};
  for (const t of m[1].matchAll(/\((\d+),\s*(\d+)\)/g)) out[+t[1]] = +t[2];
  if (Object.keys(out).length !== 5) throw harness('the generated hr_plot_tier insert is not 5 rows');
  return out;
}

/** CROPS[].req + the tier unlock sets — for the "never the gate" property. */
export function parseCrops(js) {
  const m = js.match(/export const CROPS=\{([\s\S]*?)\n\};/);
  if (!m) throw harness('src/data/gathering.js CROPS was not found');
  const out = {};
  for (const t of m[1].matchAll(/(\w+):\{[^}]*?req:(\d+)/g)) out[t[1]] = +t[2];
  if (Object.keys(out).length < 9) throw harness(`CROPS parsed ${Object.keys(out).length} rows, expected >= 9`);
  return out;
}

export function parseTierUnlocks(js) {
  const m = js.match(/export const PLOT_TIERS = \[([\s\S]*?)\n\];/);
  if (!m) throw harness('src/core/farm.js PLOT_TIERS was not found');
  const out = {};
  let level = 0;
  for (const line of m[1].split('\n')) {
    const u = line.match(/\{ unlocks: \[([^\]]*)\]/);
    if (!u) continue;
    level += 1;
    out[level] = u[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
  if (Object.keys(out).length !== 5) throw harness(`parsed ${Object.keys(out).length} tier unlock sets, expected 5`);
  return out;
}

// ── THE ASSERTIONS ─────────────────────────────────────────────────────────
// Every one is NAMED, and --selftest requires the named one to be the one that
// fires. A guard that catches a defect with the wrong assertion is a guard that
// has not been read.
export function check(src) {
  const mig  = parseMigrationPrices(src.migration);
  const self = parseMigrationSelfCheck(src.migration);
  const cli  = parseClientPrices(src.client);
  const deedsClient = parseClientDeeds(src.client);
  const deedsGen    = parseGeneratedDeeds(src.generated);
  const crops   = parseCrops(src.gathering);
  const unlocks = parseTierUnlocks(src.client);

  // MIG-SELF: the migration's own two copies agree (§1 sets it, §4 asserts it).
  for (const lv of [1, 2, 3, 4, 5]) {
    if (mig[lv].gold !== self[lv].gold || mig[lv].farming !== self[lv].farming) {
      throw fail('MIG-SELF', `plot level ${lv}: §1 sets gold=${mig[lv].gold}/lv=${mig[lv].farming} but `
        + `§4 asserts gold=${self[lv].gold}/lv=${self[lv].farming} — the migration contradicts itself`);
    }
  }

  // GOLD-PARITY / LEVEL-PARITY: the client quotes what the server charges.
  for (const lv of [2, 3, 4, 5]) {
    if (cli[lv].gold !== mig[lv].gold) {
      throw fail('GOLD-PARITY', `tier ${lv}: the client quotes ${cli[lv].gold}g, the server charges `
        + `${mig[lv].gold}g — the House -> Plot card would lie to the player`);
    }
    if (cli[lv].farming !== mig[lv].farming) {
      throw fail('LEVEL-PARITY', `tier ${lv}: the client requires farming ${cli[lv].farming}, the server `
        + `requires ${mig[lv].farming} — the button would enable on a call that refuses`);
    }
  }

  // DEED-PARITY: PLOT_TIER_PRICES.deeds == PLOT_TIERS[].cost == the GENERATED
  // catalogue. The generator is the only writer of hr_plot_tier.deed_cost, so
  // the mirror has to track it or the fallback payment is quoted wrong.
  for (const lv of [1, 2, 3, 4, 5]) {
    if (deedsGen[lv] !== deedsClient[lv - 1]) {
      throw fail('DEED-PARITY', `plot level ${lv}: the generated catalogue charges ${deedsGen[lv]} deed(s) `
        + `but PLOT_TIERS says ${deedsClient[lv - 1]} — re-run node tools/gen-farm-catalogues.mjs`);
    }
    if (lv > 1 && cli[lv].deeds !== deedsGen[lv]) {
      throw fail('DEED-PARITY', `tier ${lv}: PLOT_TIER_PRICES quotes ${cli[lv].deeds} deed(s), the catalogue `
        + `charges ${deedsGen[lv]}`);
    }
  }

  // FREE-START: plot level 1 is the state every character begins in.
  if (mig[1].gold !== 0 || mig[1].farming !== 1 || deedsGen[1] !== 0) {
    throw fail('FREE-START', `plot level 1 must be free and ungated, got gold=${mig[1].gold} `
      + `farming=${mig[1].farming} deeds=${deedsGen[1]}`);
  }

  // LADDER: every rung costs more and asks more than the one below it. A flat
  // or falling rung is either a typo or a re-price that lost a digit.
  for (const lv of [3, 4, 5]) {
    if (!(mig[lv].gold > mig[lv - 1].gold)
        || !(mig[lv].farming > mig[lv - 1].farming)
        || !(deedsGen[lv] > deedsGen[lv - 1])) {
      throw fail('LADDER', `tier ${lv} does not cost strictly more than tier ${lv - 1} `
        + `(gold ${mig[lv - 1].gold}->${mig[lv].gold}, farming ${mig[lv - 1].farming}->${mig[lv].farming}, `
        + `deeds ${deedsGen[lv - 1]}->${deedsGen[lv]})`);
    }
  }

  // NEVER-THE-GATE — THE RULING. Each tier must be buyable BEFORE the earliest
  // crop it unlocks is plantable, so the tier can never be the wall that stopped
  // the farm on 2026-08-27.
  for (const lv of [2, 3, 4, 5]) {
    const fresh = unlocks[lv].filter((c) => !unlocks[lv - 1].includes(c));
    if (!fresh.length) throw harness(`tier ${lv} unlocks no new crop — the tier table is malformed`);
    const earliest = Math.min(...fresh.map((c) => {
      if (crops[c] === undefined) throw harness(`tier ${lv} unlocks unknown crop '${c}'`);
      return crops[c];
    }));
    if (!(mig[lv].farming < earliest)) {
      throw fail('NEVER-THE-GATE', `tier ${lv} needs farming ${mig[lv].farming} but its earliest crop `
        + `(${fresh.join('/')}) needs ${earliest} — the tier would gate content the player has already `
        + `earned, which is the 2026-09-06 dead-farm bug`);
    }
  }

  return { mig, cli, deedsGen };
}

function readAll() {
  return {
    migration: readFileSync(MIGRATION, 'utf8'),
    generated: readFileSync(GENERATED, 'utf8'),
    client:    readFileSync(CLIENT, 'utf8'),
    gathering: readFileSync(GATHERING, 'utf8'),
  };
}

/** THE MODULE HALF: the text this guard parsed is the text the game RUNS. A
 *  regex that drifts from the export would make every check above vacuous. */
async function checkModuleAgrees(src) {
  const mod = await import(pathToFileURL(CLIENT).href);
  const parsed = parseClientPrices(src.client);
  for (const lv of [2, 3, 4, 5]) {
    const live = mod.PLOT_TIER_PRICES[lv];
    if (!live) throw fail('CLIENT-MODULE', `PLOT_TIER_PRICES has no tier ${lv} at runtime`);
    if (live.gold !== parsed[lv].gold || live.deeds !== parsed[lv].deeds || live.farming !== parsed[lv].farming) {
      throw fail('CLIENT-MODULE', `tier ${lv}: the parsed text says `
        + `${JSON.stringify(parsed[lv])} but the module exports ${JSON.stringify(live)}`);
    }
  }
  // And the helper the UI actually calls answers the same numbers.
  const p = mod.plotUpgradePrice(1);
  if (!p || p.level !== 2 || p.gold !== parsed[2].gold || p.farming !== parsed[2].farming
      || p.deeds !== parsed[2].deeds) {
    throw fail('CLIENT-MODULE', `plotUpgradePrice(1) answered ${JSON.stringify(p)}`);
  }
  if (mod.plotUpgradePrice(mod.MAX_PLOT_LEVEL) !== null) {
    throw fail('CLIENT-MODULE', 'plotUpgradePrice at max level must be null');
  }
  // The payment ORDER is part of the price: gold first, deeds only when short.
  const rich = mod.plotUpgradeCheck({ plotLevel: 1, farmingLevel: 99, gold: 10000, deeds: 9 });
  if (!rich.ok || rich.pay !== 'gold') {
    throw fail('CLIENT-MODULE', `a player with both currencies must be quoted GOLD, got ${JSON.stringify(rich)}`);
  }
  const short = mod.plotUpgradeCheck({ plotLevel: 1, farmingLevel: 99, gold: 0, deeds: 9 });
  if (!short.ok || short.pay !== 'deeds') {
    throw fail('CLIENT-MODULE', `a player short of gold must fall back to deeds, got ${JSON.stringify(short)}`);
  }
  const low = mod.plotUpgradeCheck({ plotLevel: 1, farmingLevel: 1, gold: 1e9, deeds: 9 });
  if (low.ok || low.error !== 'farm_level_too_low') {
    throw fail('CLIENT-MODULE', `the level gate must bite before the money, got ${JSON.stringify(low)}`);
  }
}

// ── MUTATION HARNESS ───────────────────────────────────────────────────────
// Each entry names the assertion that MUST catch it. A defect caught by the
// wrong assertion is reported as a MISS, because the two "controls" at the end
// exist to prove this harness can be silent.
const rep = (key, from, to) => (src) => {
  const out = { ...src };
  out[key] = src[key].split(from).join(to);
  return out;
};
const chain = (...fns) => (src) => fns.reduce((acc, f) => f(acc), src);

// A migration-side re-price is planted in BOTH §1 and §4 (a global replace),
// because a defect that moves only one of them is M6's job — MIG-SELF would
// otherwise catch every migration mutation and the later assertions would never
// be exercised at all. That is the "eight of eleven caught by the same throw"
// failure the renown harness had to be rewritten to avoid.
const MUTATIONS = [
  { id: 'M1', by: 'GOLD-PARITY', what: 'the server re-priced tier 2 to 5,000g and nobody moved the client',
    edit: rep('migration', '(2, 500::bigint, 5)', '(2, 5000::bigint, 5)') },
  { id: 'M2', by: 'GOLD-PARITY', what: 'the client card quotes a cheaper tier 3 than the server charges',
    edit: rep('client', '3: Object.freeze({ gold: 5000,', '3: Object.freeze({ gold: 4000,') },
  { id: 'M3', by: 'LEVEL-PARITY', what: 'the client enables the button a level early',
    edit: rep('client', 'deeds: 5, farming: 45', 'deeds: 5, farming: 44') },
  { id: 'M4', by: 'DEED-PARITY', what: 'the deed fallback was re-priced in the mirror only',
    edit: rep('client', 'gold: 100000, deeds: 8', 'gold: 100000, deeds: 2') },
  { id: 'M5', by: 'DEED-PARITY', what: 'the generated catalogue moved and PLOT_TIERS did not',
    edit: rep('generated', '  (3, 3),', '  (3, 2),') },
  { id: 'M6', by: 'MIG-SELF', what: "the migration's §4 self-check was updated but its §1 UPDATE was not",
    edit: rep('migration', '(4, 25000::bigint, 45), (5, 100000::bigint, 70)) as t(lv, g, r)',
                           '(4, 26000::bigint, 45), (5, 100000::bigint, 70)) as t(lv, g, r)') },
  { id: 'M7', by: 'FREE-START', what: 'the starting tier stopped being free',
    edit: rep('migration', '(1, 0::bigint, 1)', '(1, 250::bigint, 1)') },
  { id: 'M8', by: 'LADDER', what: 'a re-price lost a digit on BOTH sides and tier 4 became cheaper than tier 3',
    edit: chain(rep('migration', '(4, 25000::bigint, 45)', '(4, 2500::bigint, 45)'),
                rep('client', 'gold: 25000,', 'gold: 2500,')) },
  { id: 'M9', by: 'NEVER-THE-GATE',
    what: "tier 2 was pushed ABOVE carrot's own farming level on BOTH sides — the tier becomes the wall "
        + 'again, which is the whole 2026-09-06 outage',
    edit: chain(rep('migration', '(2, 500::bigint, 5)', '(2, 500::bigint, 15)'),
                rep('client', 'gold: 500,    deeds: 1, farming: 5 ', 'gold: 500,    deeds: 1, farming: 15')) },
];

const CONTROLS = [
  { id: 'C1', what: 'a comment edited in the migration (no number moved)',
    edit: rep('migration', 'FOR THE SECURITY REVIEW', 'FOR SECURITY REVIEW') },
  { id: 'C2', what: 'whitespace added to the client file',
    edit: rep('client', 'export const MAX_PLOT_LEVEL', '\nexport const MAX_PLOT_LEVEL') },
];

function applyEdit(src, m) {
  const out = m.edit(src);
  const moved = ['migration', 'generated', 'client', 'gathering'].filter((k) => out[k] !== src[k]);
  if (!moved.length) throw harness(`${m.id}: the mutation anchor did not match — the harness is stale`);
  return out;
}

function runMutations(base, list, expectSilent) {
  let bad = 0;
  for (const m of list) {
    const mutated = applyEdit(base, m);
    let caught = null, harnessErr = null;
    try { check(mutated); } catch (e) {
      if (e.harness) harnessErr = e; else caught = e;
    }
    if (harnessErr) {
      console.error(`  ✗ ${m.id} HARNESS — ${harnessErr.message}`);
      process.exit(2);
    }
    if (expectSilent) {
      if (caught) { console.error(`  ✗ ${m.id} CONTROL FIRED (${caught.assertion}) — ${m.what}`); bad++; }
      else console.log(`  ✓ ${m.id} silent (control) — ${m.what}`);
      continue;
    }
    if (!caught) { console.error(`  ✗ ${m.id} MISSED — ${m.what}`); bad++; continue; }
    if (caught.assertion !== m.by) {
      console.error(`  ✗ ${m.id} caught by ${caught.assertion}, expected ${m.by} — ${m.what}`);
      bad++; continue;
    }
    console.log(`  ✓ ${m.id} caught by ${caught.assertion} — ${m.what}`);
  }
  return bad;
}

// ── MAIN ───────────────────────────────────────────────────────────────────
try {
  const src = readAll();

  // THE FALSE-POSITIVE FLOOR. Every mode starts by proving the REAL files pass;
  // a guard that is already red cannot demonstrate anything about a mutation.
  const facts = check(src);
  await checkModuleAgrees(src);
  console.log('plot-tier-parity: the four authored copies agree.');
  for (const lv of [2, 3, 4, 5]) {
    console.log(`  tier ${lv}: ${facts.mig[lv].gold.toLocaleString('en-US')}g  or  ${facts.deedsGen[lv]} deed(s)`
      + `   at farming ${facts.mig[lv].farming}`);
  }

  if (argv.includes('--selftest') || argv.includes('--mutate')) {
    const list = argv.includes('--mutate') ? MUTATIONS.slice(0, 3) : MUTATIONS;
    console.log(argv.includes('--mutate')
      ? '\n--mutate: 3 defects planted in the REAL file text (in memory; nothing is written).'
      : `\n--selftest: ${MUTATIONS.length} planted defects + ${CONTROLS.length} negative controls.`);
    let bad = runMutations(src, list, false);
    if (!argv.includes('--mutate')) bad += runMutations(src, CONTROLS, true);
    if (bad) { console.error(`\n${bad} mutation(s) not handled as specified.`); process.exit(1); }
    console.log('\nevery planted defect was caught by its NAMED assertion; every control stayed silent.');
  }

  console.log('plot-tier-parity: GREEN');
} catch (e) {
  if (e.harness) { console.error(`HARNESS: ${e.message}`); process.exit(2); }
  console.error(`FAILED${e.assertion ? ` [${e.assertion}]` : ''}: ${e.message}`);
  process.exit(1);
}
