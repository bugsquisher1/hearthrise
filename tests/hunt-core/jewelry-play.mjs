// tests/hunt-core/jewelry-play.mjs — CRAFTED JEWELRY'S PERKS ON THE REAL SETTLE (src/data/jewelry.js; PRIORITY_BOARD "2026-11-04 Crafted
// jewelry"). Run by run-all.mjs.
//
// both-paths     a hero in Hallmarked rings, alone and in a four: a watched hunt (10 s settles) and a closed browser (10 min) land
//                every blow, crit, follow-through and surge alike, and the perks change the hunt they play.
// perks-show     each perk does what its words say, on the dice: Keen crits more basic blows, Follow-through lands the same blow on a
//                second monster beside the target (a `follow` number), Surge lands a cast's numbers half again as hard (a crit-marked heal).
// once-per-hero  two Keen rings play exactly one: a perk counts once however many pieces carry it.
// plain-draws-nothing  a hero in plain rings carries no perk on its unit, so its hunt is the hunt its stats make.
//
// mutant-anchors: src/core/combat.js src/core/combat-sim.js src/core/member.js src/core/hunt/damage.js src/core/hunt/abilities.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

const HOUR = 3600000, GLADE = 'mosslight_glade';
const SEEDS = ['-4611686018427387904', '77'];
/* The sample's rows (src/data/jewelry.js JEWELRY_ITEMS): Keen + Follow-through for blows, Surge for casts and heals. */
const RINGS = Object.freeze({
  blows: { ring1: 'banded_signet_keen_follow', ring2: 'banded_signet_keen_follow' },
  casts: { ring1: 'banded_signet_surge_follow', ring2: 'banded_signet_keen_surge' },
  plain: { ring1: 'banded_signet', ring2: 'banded_signet' },
  keenTwice: { ring1: 'banded_signet_keen', ring2: 'banded_signet_keen' },
  keenOnce: { ring1: 'banded_signet_keen', ring2: 'banded_signet' },
});
const ringsFor = (set) => (role) => (typeof set === 'function' ? set(role) : set);
const PERKED = (role) => (role === 'healer' || role === 'mage' ? RINGS.casts : RINGS.blows);

/* A whole result in one string: keys sorted, since a credit map's order is the order of its first credit in a cut. */
const sorted = (x) => (Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);

/** One span on the real settle, every hero in its ladder kit plus the rings `rings(role)` names. */
function play(P, ground, L, roles, o) {
  const ids = new Set(), events = [];
  const r = P.run(ground, L, roles, { spanMs: o.spanMs || HOUR, secret: o.secret || SEEDS[0], windowMs: o.windowMs || 600000,
    equipment: (role) => Object.assign(P.kitFor(L, role), ringsFor(o.rings)(role)),
    onWindow: (out) => {
      for (const p of out.members) if (p.hunt && p.hunt.unit_id) ids.add(p.hunt.unit_id);
      for (const e of out.events || []) events.push(e);
    } });
  const mine = (e) => ids.has(e.u);
  const count = (pred) => events.filter((e) => mine(e) && pred(e)).length;
  return {
    r, whole: JSON.stringify(sorted([r.totals, r.members, r.items, r.heroXp])) + JSON.stringify(events),
    basics: count((e) => e.type === 'dmg' && e.ability === 'basic' && !e.follow && !ids.has(e.t)),
    crits: count((e) => e.type === 'dmg' && e.ability === 'basic' && e.crit && !e.follow && !ids.has(e.t)),
    follows: count((e) => e.type === 'dmg' && e.follow === true),
    heals: count((e) => e.type === 'heal'),
    surgedHeals: count((e) => e.type === 'heal' && e.crit === true),
    casts: count((e) => e.type === 'cast'),
  };
}
const sum = (rs, k) => rs.reduce((a, x) => a + x[k], 0);

const cases = {
  'both-paths': (P) => {
    for (const roles of [['tank'], ['ranger'], ['healer'], ['tank', 'healer', 'ranger', 'mage']]) {
      const viewed = play(P, GLADE, 24, roles, { spanMs: HOUR / 4, windowMs: 10000, rings: PERKED });
      const closed = play(P, GLADE, 24, roles, { spanMs: HOUR / 4, windowMs: 600000, rings: PERKED });
      if (viewed.whole !== closed.whole) return roles.join('+') + ': a watched hunt and a closed browser disagree';
      const plain = play(P, GLADE, 24, roles, { spanMs: HOUR / 4, rings: RINGS.plain });
      if (plain.whole === closed.whole) return roles.join('+') + ': the perks changed nothing on this hunt';
    }
    return null;
  },
  'perks-show': (P) => {
    const blows = SEEDS.map((secret) => play(P, GLADE, 24, ['tank'], { secret, rings: RINGS.blows }));
    const plainBlows = SEEDS.map((secret) => play(P, GLADE, 24, ['tank'], { secret, rings: RINGS.plain }));
    const keen = sum(blows, 'crits') / sum(blows, 'basics'), base = sum(plainBlows, 'crits') / sum(plainBlows, 'basics');
    /* Keen at T2 is +4 points of crit on a basic blow: the measured gap must be near it, never nothing and never double. */
    if (!(keen - base > 0.02 && keen - base < 0.07)) return 'Keen moved the crit rate ' + (100 * base).toFixed(1) + '% -> ' + (100 * keen).toFixed(1) + '%';
    if (sum(plainBlows, 'follows') !== 0) return 'a hero in plain rings followed through';
    const ft = sum(blows, 'follows') / sum(blows, 'basics');
    /* Follow-through at T2 is 4% of the blows that have a monster beside the target: some, never more than 4% of every blow (+ noise). */
    if (!(ft > 0.005 && ft < 0.055)) return 'Follow-through landed on ' + (100 * ft).toFixed(2) + '% of basic blows';
    const heals = SEEDS.map((secret) => play(P, GLADE, 24, ['tank', 'healer'], { secret, rings: (role) => (role === 'healer' ? RINGS.casts : RINGS.plain) }));
    const plainHeals = SEEDS.map((secret) => play(P, GLADE, 24, ['tank', 'healer'], { secret, rings: RINGS.plain }));
    if (sum(plainHeals, 'surgedHeals') !== 0) return 'a healer in plain rings surged a heal';
    const sg = sum(heals, 'surgedHeals') / Math.max(1, sum(heals, 'heals'));
    /* Surge at T2 is 6.7% of casts with numbers. */
    if (!(sum(heals, 'heals') > 40 && sg > 0.02 && sg < 0.13)) return 'Surge marked ' + sum(heals, 'surgedHeals') + ' of ' + sum(heals, 'heals') + ' heals';
    return null;
  },
  'once-per-hero': (P) => {
    for (const role of ['tank', 'ranger']) {
      const twice = play(P, GLADE, 24, [role], { spanMs: HOUR / 4, rings: RINGS.keenTwice });
      const once = play(P, GLADE, 24, [role], { spanMs: HOUR / 4, rings: RINGS.keenOnce });
      if (twice.whole !== once.whole) return role + ': two Keen rings played more than one';
    }
    return null;
  },
  'plain-draws-nothing': (P, X) => {
    const worn = Object.assign(P.kitFor(24, 'tank'), RINGS.plain);
    const eq = X.C.equipmentStats(worn, X.ITEMS);
    if (eq.jewel !== undefined) return 'plain rings carry perks: ' + JSON.stringify(eq.jewel);
    const perked = X.C.equipmentStats(Object.assign(P.kitFor(24, 'tank'), RINGS.blows), X.ITEMS);
    if (JSON.stringify(perked.jewel) !== JSON.stringify({ keen: 40, follow: 40 })) return 'Hallmarked rings read ' + JSON.stringify(perked.jewel);
    return null;
  },
};

const mutants = [
  { name: 'the settle never puts Follow-through on the unit', case: 'perks-show', edits: [['src/core/combat-sim.js', '  if (snap.followPm) u.followPm = snap.followPm; else if (u.followPm) delete u.followPm;\n', '']] },
  { name: 'Keen never reaches the crit chance', case: 'perks-show', edits: [['src/core/combat.js', 'const keen = eq.jewel && eq.jewel.keen ? eq.jewel.keen / 1000 : 0;', 'const keen = 0;']] },
  { name: 'Surge never lands', case: 'perks-show', edits: [['src/core/hunt/abilities.js', 'return u.surgePm > 0 && !!(row.dmg || row.heal || row.shield) && sc.rng.chance(u.surgePm / 1000);', 'return false;']] },
  { name: 'a perk counts once per piece, so two rings stack', case: 'once-per-hero', edits: [['src/core/combat.js', "if (pm > 0 && (!out || !(out[k] >= pm))) { out = out || {}; out[k] = pm; }", "if (pm > 0) { out = out || {}; out[k] = (out[k] || 0) + pm; }"]] },
  { name: 'Follow-through draws from the wall clock, so two cuts disagree', case: 'both-paths', edits: [['src/core/hunt/damage.js', 'if (next && sc.rng.chance(u.followPm / 1000))', 'if (next && Math.random() < u.followPm / 1000)']] },
  { name: 'a plain ring carries an empty perk map', case: 'plain-draws-nothing', edits: [['src/core/combat.js', '  if (jewel) s.jewel = jewel;', '  s.jewel = jewel || {};']] },
];

const R = makeReport('hunt-core/jewelry-play');
const load = async (root) => {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  return { P: await loadPlay(root), X: { C: await imp('src/core/combat.js'), ITEMS: (await imp('src/data/items.js')).ITEMS } };
};
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const home = await load(ROOT);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = fn(home.P, home.X); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { const m = await load(p.root); why = cases[mu.case](m.P, m.X); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
R.finish();
