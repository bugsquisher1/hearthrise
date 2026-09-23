#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-stance-stop.mjs — A STANCE CARRIES NO POWER, AND A HUNT STOPS
//                              AT THE SAME MOMENT ATTENDED AND AWAY.
//
//   node tests/hunt-stance-stop.mjs             # the guard
//   node tests/hunt-stance-stop.mjs --list      # the mutation catalogue
//   node tests/hunt-stance-stop.mjs --selftest  # every mutation must be CAUGHT
//   node tests/hunt-stance-stop.mjs --mutate=<id>
//
// Ships with: src/core/hunt.js · supabase/functions/hr-accrue/accrual.js
//             supabase/functions/hr-accrue/set-activity.js
//             supabase/migrations/2026-09-22-hunt-stance-stop.sql
//
// ── THE TWO PROPERTIES ──────────────────────────────────────────────────
// docs/design/HUNTS_AND_ANALYZER.md §2.2 makes one rule load-bearing above
// every other line in the feature: A STANCE MAY NEVER INTRODUCE A MULTIPLIER,
// A RATE OR A BONUS. The moment it pays power it is a balance surface, a thing
// to sell, and a second combat path to keep at AWAY-1 parity.
//
// §2.4 makes the second: the stop rules are evaluated INSIDE the settle by the
// ONE engine, so the live tick and the away replay end a player's night at the
// SAME moment. A stop rule with two implementations is worse than none: its two
// copies would disagree about when a player's hunt ended, and only one of them
// would be the one that wrote the row.
//
// ── THE EXPLOIT THIS GUARD WAS WRITTEN AFTER FINDING ────────────────────
// `careful` asks for a 0.75 auto-eat threshold. Auto-Eat I's ceiling is 25%
// (src/core/auto-eat.js AUTO_EAT_TIERS) and `player_state.auto_eat_pct` is
// clamped to it by SQL — so handing the stance's number straight to the
// simulation hands every player the entitlement of the 100-mark Auto-Eat II
// upgrade, for free, by picking a button. That is a stance carrying POWER, it
// is a real purchase being given away, and arm S4 is the one that catches it.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeFile, unlink } from 'node:fs/promises';

import { ROOT } from './schema-replay.mjs';
import {
  STANCES, STANCE_KEYS, DEFAULT_STANCE, stanceOf, assertNoStanceMultiplier,
  validateStop, evaluateStop, STOP_BOUNDS, STOP_ORDER,
} from '../src/core/hunt.js';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { AUTO_EAT_TIERS } from '../src/core/auto-eat.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTANT ENGINE ───────────────────────────────────────────────────
   A mutation that only edits this file's EXPECTATIONS proves nothing: it moves
   the goalposts and then reports that the ball went through them. These two
   mutations edit the ENGINE — accrual.js is copied beside itself with one
   textual patch and imported, so its relative imports still resolve and the
   arm below drives genuinely different code. The copy is deleted afterwards.

   The anchor must match EXACTLY ONCE, for the reason schema-replay.mjs's patch
   loader says so: a mutation that silently no-ops reads as "caught" and the
   guard it was meant to prove is left decorative. */
const FN_DIR = join(ROOT, 'supabase/functions/hr-accrue');
const ENGINE_PATCHES = {
  stance_bypasses_tier: [[
    '      ? Math.min(stance.eatAt, eatCeiling)',
    '      ? stance.eatAt',
  ]],
  stop_away_only: [[
    '  if (state.activeMonster && summary.stoppedBy !== COMBAT_STOP.RETREAT) {',
    '  if (state.activeMonster && summary.stoppedBy !== COMBAT_STOP.RETREAT && !attended) {',
  ]],
};

async function loadEngine(mutate) {
  const list = ENGINE_PATCHES[mutate];
  if (!list) return computeAccrual;
  let src = await readFile(join(FN_DIR, 'accrual.js'), 'utf8').then((t) => t.replace(/\r\n/g, '\n'));
  for (const [find, replace] of list) {
    const n = src.split(find).length - 1;
    if (n !== 1) {
      throw Object.assign(new Error(
        `mutation '${mutate}' anchor matched ${n} times in accrual.js (need exactly 1). `
        + 'The engine text has moved; fix the anchor rather than letting the mutation no-op.'),
      { harness: true });
    }
    src = src.replace(find, () => replace);
  }
  const path = join(FN_DIR, `accrual.__mutant_${mutate}_${process.pid}.js`);
  await writeFile(path, src, 'utf8');
  try {
    const mod = await import(`file://${path}?t=${Date.now()}`);
    return mod.computeAccrual;
  } finally {
    await unlink(path).catch(() => {});
  }
}

/* ── THE MUTATION CATALOGUE ──────────────────────────────────────────────
   A guard that has never been red is not a guard (CLAUDE.md §4). Each entry
   plants ONE defect the property forbids; --selftest requires every one to be
   CAUGHT, so an assertion that stopped asserting fails the build. */
const MUTATIONS = {
  stance_multiplier: 'Give a stance a damage multiplier (design §2.2 forbids it outright).',
  stance_bypasses_tier: 'Let the stance auto-eat threshold ignore the purchased Auto-Eat tier ceiling.',
  stop_clamps: 'Clamp an out-of-bounds stop value instead of refusing it.',
  stop_away_only: 'Evaluate the stop rules only on the away path (breaks AWAY-1).',
  stop_order: 'Check the time cap before the fall counter (design §2.4 fixes the order).',
  stop_bound_overflows: 'Cast a stop bound back to bigint, so a huge JSON number RAISES from inside a CHECK (H-2).',
  stances_claim_authority: 'Drop the ID-ALLOWLIST declaration, so the catalogue claims an authority its values do not have (H-1).',
};

const MON = 'goblin';
const FROM = Date.UTC(2026, 8, 22, 12, 0, 0);

/** A twelve-hour unattended night, with whatever hunt fields the arm names. */
let ENGINE = computeAccrual;
const night = (o = {}) => ENGINE({
  userId: '00000000-0000-4000-8000-0000b5510901', slot: 0,
  nowMs: FROM + (o.spanMs || 12 * 3600000), accruedToMs: FROM, activeSinceMs: FROM,
  activeKind: 'combat', activeId: o.monster || MON,
  capMs: 24 * 3600000, seed: 12345,
  /* A CHARACTER WHO CAN ACTUALLY WIN. The first draft ran an unarmed 60-HP
     hero, who died six times in four hours and ended the night on the RECOVERY
     RETREAT — a different, legitimate stop — so S5 measured the retreat instead
     of the rule. A stop-rule fixture has to be a hero the rule is the FIRST
     thing to end. */
  hp: o.maxHp || 900, maxHp: o.maxHp || 900,
  gold: 0,
  skills: o.skills || { attack: 400000, strength: 400000, defense: 400000, hitpoints: 400000 },
  equipment: o.equipment || {}, inventory: o.inventory || {},
  /* THE ATTENDED ARM IS A REAL ATTENDED PAYLOAD, not a boolean. `attended` in
     the engine is `normaliseAttended(inp.attended)` — an OBJECT or null — so
     `attended: true` normalises to null and BOTH arms would have run the away
     path. The first draft of S5 did exactly that and proved nothing; this is
     the shape hr_attended_kills actually projects. */
  attended: o.attended
    ? { kills: { [o.monster || MON]: 25 },
        from: new Date(FROM).toISOString(),
        to: new Date(FROM + (o.spanMs || 12 * 3600000)).toISOString() }
    : null,
  autoEatEnabled: o.autoEatEnabled !== false,
  autoEatFood: o.autoEatFood || null,
  autoEatPct: typeof o.autoEatPct === 'number' ? o.autoEatPct : 10,
  recoveringUntilMs: 0,
  consecFalls: typeof o.consecFalls === 'number' ? o.consecFalls : 0,
  deathsTodayBefore: 0, deathsLifetimeBefore: 60,
  items: ITEMS, monsters: MONSTERS,
  huntStance: o.huntStance ?? null,
  huntStop: o.huntStop ?? null,
  traits: o.traits ?? null,
  vigour: o.vigour ?? null,
  ...(o.extra || {}),
});

async function run(mutate) {
  const M = (id) => mutate === id;
  ENGINE = await loadEngine(mutate);

  // ── S1. THE STANCE TABLE CARRIES ONLY THE THREE SHIPPED KNOBS ──────────
  // Asserted against the KEY LIST, not against a count, because a count is
  // satisfied by a rename and the rule is about what a stance may DO.
  const table = M('stance_multiplier')
    ? { ...STANCES, reckless: { ...STANCES.reckless, dmgMult: 1.25 } }
    : STANCES;
  let threw = null;
  try { assertNoStanceMultiplier(table); } catch (e) { threw = e; }
  ok(!(M('stance_multiplier') && threw === null),
    'S1: assertNoStanceMultiplier ACCEPTED a stance carrying a damage multiplier. §2.2 is the one '
    + 'rule in this feature that outranks every other line, and the assertion meant to hold it '
    + 'does nothing.');
  ok(!(!M('stance_multiplier') && threw !== null),
    `S1: assertNoStanceMultiplier rejected the SHIPPED table — ${threw && threw.message}`);
  for (const id of Object.keys(table)) {
    for (const k of Object.keys(table[id])) {
      ok(STANCE_KEYS.includes(k),
        `S1: stance '${id}' carries '${k}', which is not one of the three shipped knobs. A stance `
        + 'may never introduce a multiplier, a rate or a bonus (design §2.2).');
    }
  }

  // ── S2. THE MIGRATION'S CATALOGUE AGREES WITH THE RUNTIME TABLE ────────
  // Two copies of a stance is exactly what this file exists to prevent, and the
  // SQL seed is the second copy. Read out of the migration text rather than a
  // database, so it runs credential-free beside the cheap guards.
  /* THE MIGRATION TEXT, and the two mutations that plant a defect IN IT. Same
     idiom as the engine mutations above - the patch is applied to the SHIPPED
     file's bytes, and a patch that matched no anchor throws rather than
     silently no-opping, so a moved goalpost cannot read as a catch. */
  let migSrc = await readFile(
    join(ROOT, 'supabase/migrations/2026-09-22-hunt-stance-stop.sql'), 'utf8');
  const MIG_PATCH = {
    stop_bound_overflows: ["(p_stop->>'hours')::numeric between 1 and 24",
      "(p_stop->>'hours')::bigint between 1 and 24"],
    stances_claim_authority: ['THIS TABLE IS AN ID ALLOWLIST. THE KNOB VALUES ARE NOT READ AT RUNTIME.',
      '(nothing to say about what the knob columns do)'],
  };
  if (MIG_PATCH[mutate]) {
    const [find, replace] = MIG_PATCH[mutate];
    const n = migSrc.split(find).length - 1;
    if (n !== 1) {
      throw Object.assign(new Error(
        `mutation '${mutate}' anchor matched ${n} times in 2026-09-22-hunt-stance-stop.sql `
        + '(need exactly 1). The migration text has moved; fix the anchor rather than letting the '
        + 'mutation no-op.'), { harness: true });
    }
    migSrc = migSrc.replace(find, () => replace);
  }
  for (const id of Object.keys(STANCES)) {
    const s = STANCES[id];
    const row = new RegExp(`\\('${id}',\\s*([0-9.]+),\\s*'(stop|swing)',\\s*(null|\\d+)\\)`);
    const m = migSrc.match(row);
    ok(!!m, `S2: hr_hunt_stances has no seeded row for '${id}' — the catalogue and the engine disagree.`);
    if (!m) continue;
    ok(Math.abs(Number(m[1]) - s.eatAt) < 1e-9,
      `S2: '${id}' eat_at is ${m[1]} in SQL and ${s.eatAt} in src/core/hunt.js.`);
    ok(m[2] === s.ammoDry, `S2: '${id}' ammo_dry is ${m[2]} in SQL and ${s.ammoDry} in core.`);
    const falls = m[3] === 'null' ? null : Number(m[3]);
    ok(falls === s.falls, `S2: '${id}' falls is ${m[3]} in SQL and ${s.falls} in core.`);
  }
  // The SQL bounds and the JS bounds are one rule with two spellings.
  for (const [field, b] of Object.entries(STOP_BOUNDS)) {
    if (b.bool) continue;
    ok(migSrc.includes(`'${field}')::numeric between ${b.min} and ${b.max}`),
      `S2: hr_hunt_stop_valid does not carry the published ${field} bounds [${b.min}, ${b.max}] `
      + 'as a numeric comparison.');
  }

  /* -- S2b. THE BOUNDS CAST TO numeric, NOT bigint (finding H-2) ---------
     jsonb numbers ARE numeric and hold far more than a bigint. {"hours": 1e30}
     passes jsonb_typeof = 'number', renders as 31 digits, matches the digit
     test - and then OVERFLOWS a bigint cast, raising 22003 FROM INSIDE A CHECK
     CONSTRAINT instead of returning false. A predicate that raises is not a
     predicate. Unreachable today (the edge's validateStop refuses a
     non-integer and hr_apply turns a `false` into a named bad_stop), which is
     exactly why it is defence in depth: the only caller that can reach
     hr_apply without the edge is the one this re-validation layer exists for.
     Asserted on the TEXT because this guard is credential-free by design; the
     migration's section-6 GATE(b2) drives all four rules through the real
     function at apply time and fails the install on a raise. */
  ok(!/p_stop->>'(hours|food_floor|ammo_floor|falls)'\)::bigint/.test(migSrc),
    'S2b: a stop bound in hr_hunt_stop_valid still casts to ::bigint. A jsonb number can hold far '
    + 'more than a bigint, so the cast raises 22003 from inside a CHECK constraint rather than '
    + 'returning false - and the one caller that can reach it is the one that bypassed the edge. '
    + 'Cast to ::numeric, which cannot overflow here.');

  /* -- S2c. THE CATALOGUE SAYS WHICH AUTHORITY IT ACTUALLY HAS (H-1(a)) --
     hr_hunt_stances' `stance_id` IS the authority hr_apply validates against
     and the only stance check a compromised edge cannot bypass. Its three knob
     columns are read by NOTHING - the engine resolves a stance through the
     frozen STANCES table in src/core/hunt.js - so an operator who tunes
     `eat_at` changes nothing and is told nothing. That is worse than a plain
     duplicate, because one copy is silently inert. The file takes the review's
     answer (a): say so. This arm keeps the saying from rotting away; the
     migration's GATE(b3) is the executable half, refusing the apply the day a
     routine reads a knob column without the documentation moving with it. */
  ok(/THIS TABLE IS AN ID ALLOWLIST\. THE KNOB VALUES ARE NOT READ AT RUNTIME/.test(migSrc),
    'S2c: 2026-09-22-hunt-stance-stop.sql no longer declares hr_hunt_stances an ID ALLOWLIST whose '
    + 'knob values nothing reads (finding H-1, answer (a)). Either the engine now reads them - in '
    + 'which case this is answer (b) and the header, the table comment, GATE(b3) and this arm all '
    + 'move together - or the documentation was deleted and the next person to tune eat_at will '
    + 'believe they changed something.');

  // ── S3. THE BOUNDS REFUSE, THEY DO NOT CLAMP ───────────────────────────
  // A clamp lets a client discover a hidden maximum by pushing at one, which is
  // how a bound becomes a catalogue.
  const V = M('stop_clamps')
    ? (raw) => {
      const r = validateStop(raw);
      if (r.ok || r.error !== 'stop_out_of_range') return r;
      const out = {};
      for (const k of Object.keys(raw)) {
        const b = STOP_BOUNDS[k];
        out[k] = b && !b.bool ? Math.max(b.min, Math.min(b.max, raw[k])) : raw[k];
      }
      return { ok: true, stop: out };
    }
    : validateStop;
  const over = V({ hours: 9999 });
  ok(!over.ok,
    'S3: hours=9999 was ACCEPTED. An out-of-range stop rule is a REFUSAL, never a clamp — a clamp '
    + 'lets a client discover a hidden maximum by pushing at one.');
  ok(V({ hours: 24 }).ok, 'S3: hours=24 is in bounds and was refused.');
  ok(!V({ hours: 0 }).ok, 'S3: hours=0 was accepted.');
  ok(!V({ forever: true }).ok, 'S3: an unknown rule key was accepted — the allowlist is not one.');
  ok(!V({ bag_full: 'yes' }).ok, 'S3: a string bag_full was accepted.');
  ok(V(null).ok && V(null).stop === null, 'S3: a null stop must be legal and mean "no rules".');
  ok(stanceOf('__proto__').id === DEFAULT_STANCE,
    'S3: stanceOf("__proto__") did not fail safe to the default — the prototype trap is open.');

  // ── S4. A STANCE MAY NOT BUY THE AUTO-EAT TIER A PLAYER PAID FOR ───────
  // THE EXPLOIT IN THE HEADER. `careful` asks for 0.75; a tier-1 character is
  // entitled to 0.25. The engine must hand the simulation the SMALLER number.
  const tier1 = ['auto_eat'];
  const fed = { inventory: { trout: 900 }, autoEatFood: 'trout' };
  const careful1 = night({ ...fed, huntStance: 'careful', traits: tier1 });
  const ceilT1 = AUTO_EAT_TIERS[1].maxPct / 100;
  const ceilT2 = AUTO_EAT_TIERS[2].maxPct / 100;
  ok(ceilT1 < STANCES.careful.eatAt,
    'S4 CANNOT RUN: Auto-Eat I\'s ceiling is no longer below careful\'s threshold, so this arm '
    + 'proves nothing. Re-derive it against AUTO_EAT_TIERS before deleting the arm.');
  const pct1 = careful1.summary && careful1.summary.autoEat && careful1.summary.autoEat.pct;
  ok(typeof pct1 === 'number',
    'S4: the engine did not report the auto-eat threshold it ran with — the receipt rule (b341) '
    + 'is what makes this assertable at all.');
  if (typeof pct1 === 'number') {
    ok(pct1 <= Math.round(ceilT1 * 100),
      `S4: a tier-1 character running 'careful' fought at a ${pct1}% auto-eat threshold, above `
      + `their entitlement of ${Math.round(ceilT1 * 100)}%. A free stance just bought the `
      + `${AUTO_EAT_TIERS[2].marks}-mark ${AUTO_EAT_TIERS[2].name} upgrade.`);
  }
  // And it DOES apply for a character who owns the tier — otherwise the clamp
  // above would be "the stance does nothing", which passes for the wrong reason.
  const careful2 = night({ ...fed, huntStance: 'careful', traits: ['auto_eat', 'auto_eat_2'] });
  const pct2 = careful2.summary && careful2.summary.autoEat && careful2.summary.autoEat.pct;
  ok(pct2 === Math.round(Math.min(STANCES.careful.eatAt, ceilT2) * 100),
    `S4: a tier-2 character running 'careful' fought at ${pct2}%, not the stance's `
    + `${Math.round(STANCES.careful.eatAt * 100)}%. The clamp has become a floor and the stance `
    + 'does nothing at all.');
  // NO STANCE -> THE STORED DIAL, UNTOUCHED. The whole feature is inert until chosen.
  const plain = night({ ...fed, autoEatPct: 20 });
  const pct0 = plain.summary && plain.summary.autoEat && plain.summary.autoEat.pct;
  ok(pct0 === 20,
    `S4: a character with NO stance fought at ${pct0}%, not their stored 20%. This feature is `
    + 'supposed to be a no-op until a stance is chosen.');

  // ── S5. THE STOP VERDICT IS THE SAME ATTENDED AND AWAY (AWAY-1) ────────
  // The same window, twice, differing only in the flag. `attended` changes the
  // loot top-up and the XP split; it must not change WHEN the hunt ends.
  const stop = { hours: 1 };
  const arms = [false, true].map((attended) => night({
    ...fed, spanMs: 4 * 3600000, huntStop: stop, attended,
  }));
  const idled = arms.map((a) => !!(a.delta && a.delta.activity && a.delta.activity.kind === 'idle'));
  const named = arms.map((a) => (a.delta && a.delta.journal && a.delta.journal.meta
    && a.delta.journal.meta.stopped) || null);
  ok(idled[0] === idled[1],
    `S5: the hunt stopped away=${idled[0]} and attended=${idled[1]} over the SAME window. A stop `
    + 'rule with two answers is a second combat path (AWAY-12), and only one of them wrote the row.');
  ok(named[0] === named[1],
    `S5: the receipt named '${named[0]}' away and '${named[1]}' attended.`);
  ok(idled[0] === true,
    'S5: a four-hour window under a one-hour stop rule did not idle the pointer at all. The rule '
    + 'is unimplemented, not merely inconsistent.');
  ok(named[0] === 'hours',
    `S5: the receipt named '${named[0]}' rather than 'hours' — meta.stopped is the ONLY record `
    + 'of why a night ended.');

  // ── S6. THE ORDER IS THE DESIGN'S, AND IT IS OBSERVABLE ────────────────
  // §2.4 fixes it so two lanes cannot answer it differently: deaths first,
  // because a character who is dying should stop before we ask whether their bag
  // is tidy; the time cap LAST, because it is the only rule that is not about
  // something going wrong.
  const order = M('stop_order')
    ? ['hours', 'falls', 'bag_full', 'food_floor', 'ammo_floor']
    : STOP_ORDER;
  const evalWith = (o) => {
    for (const rule of order) {
      const one = evaluateStop({ ...o, stop: { [rule]: o.stop[rule] } });
      if (one) return one;
    }
    return null;
  };
  const both = evalWith({
    stop: { falls: 2, hours: 1 }, stance: STANCES.steady,
    consecFalls: 5, bagFree: null, foodStack: 999, ammoStock: 999, paidMs: 9 * 3600000,
  });
  ok(both === 'falls',
    `S6: with BOTH a fall rule and a time cap satisfied the engine named '${both}'. Deaths come `
    + 'first (§2.4) — a night that ended in a pile of corpses must not be reported as "you ran long".');
  ok(STOP_ORDER[0] === 'falls' && STOP_ORDER[STOP_ORDER.length - 1] === 'hours',
    `S6: STOP_ORDER is ${STOP_ORDER.join(' -> ')}; §2.4 fixes falls first and hours last.`);

  // ── S7. THE FAIL-SAFE DIRECTION IS "DO NOT STOP" ───────────────────────
  // An unreadable count must never end a night that was going fine. It costs
  // one window to re-assert a real condition; it costs a night to invent one.
  ok(evaluateStop({ stop: { bag_full: true }, stance: STANCES.steady, bagFree: null }) === null,
    'S7: an UNKNOWN free-slot count stopped the hunt. This game has no bag capacity at all, so '
    + 'that rule would end every night for a reason that does not exist.');
  ok(evaluateStop({ stop: { food_floor: 10 }, stance: STANCES.steady, foodStack: NaN }) === null,
    'S7: an unreadable food count stopped the hunt.');
  ok(evaluateStop({ stop: {}, stance: STANCES.steady, consecFalls: 99, paidMs: 1e9 }) === null,
    'S7: a hunt with NO rules stopped anyway — an absent field must be no rule.');

  return problems;
}

// ── HARNESS ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  console.log('tests/hunt-stance-stop.mjs — mutation catalogue\n');
  for (const [id, why] of Object.entries(MUTATIONS)) console.log(`  ${id.padEnd(22)} ${why}`);
  process.exit(0);
}
const only = (argv.find((a) => a.startsWith('--mutate=')) || '').split('=')[1] || null;

if (argv.includes('--selftest')) {
  let bad = 0;
  for (const id of Object.keys(MUTATIONS)) {
    problems.length = 0;
    const found = await run(id);
    if (found.length === 0) {
      console.log(`  ✗ ${id}: NOT CAUGHT — the arm that should see it is asserting nothing`);
      bad++;
    } else {
      console.log(`  ✓ ${id}: caught (${found.length} assertion(s))`);
    }
  }
  problems.length = 0;
  const clean = await run(null);
  if (clean.length) { console.log(`  ✗ UNMUTATED run is red:\n    ${clean.join('\n    ')}`); bad++; }
  console.log(bad ? `\nhunt-stance-stop --selftest: ${bad} problem(s)` : '\nhunt-stance-stop --selftest: every mutation caught, unmutated run green');
  process.exit(bad ? 1 : 0);
}

const found = await run(only);
if (found.length) {
  console.log(`  ✗ hunt-stance-stop: ${found.length} problem(s)`);
  for (const p of found) console.log(`      ${p}`);
  process.exit(only ? 0 : 1);
}
console.log('hunt-stance-stop: OK — a stance carries only the three shipped knobs and cannot buy an '
  + 'auto-eat tier, the stop bounds refuse rather than clamp, the rules fire in the design\'s order, '
  + 'and the hunt ends at the same moment attended and away.');
process.exit(only ? 1 : 0);
