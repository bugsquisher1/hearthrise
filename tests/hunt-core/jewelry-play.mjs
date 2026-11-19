// tests/hunt-core/jewelry-play.mjs — CRAFTED JEWELRY'S PERKS ON THE REAL SETTLE (src/data/jewelry.js; PRIORITY_BOARD "2026-11-04 Crafted
// jewelry"). Run by run-all.mjs.
//
// both-paths     a hero in Hallmarked rings, alone and in a four: a watched hunt (10 s settles) and a closed browser (10 min) land
//                every blow, crit, follow-through and surge alike, and the perks change the hunt they play.
// perks-show     each perk does what its words say, on the dice: Keen crits more basic blows, Follow-through lands the same blow on a
//                second monster beside the target (a `follow` number), Surge lands a cast's numbers half again as hard (a crit-marked heal).
// earrings-show  the earrings' pair (lane/d-jewelry-sample 2026-11-18): Steady turns some of a hero's missed basic blows into hits (its
//                misses fall by about its share), and Focus gives a caster mana back on its kills, so a mage swings its mana basic more.
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
/* The earrings (src/data/jewelry.js, Smithing): Steady and Focus at T2 (150 and 20 permille), and the plain studs they are measured over. */
const EARS = Object.freeze({ both: { earrings: 'fang_studs_steady_focus' }, steady: { earrings: 'fang_studs_steady' }, focus: { earrings: 'fang_studs_focus' },
  plain: { earrings: 'fang_studs' } });
const ringsFor = (set) => (role) => (typeof set === 'function' ? set(role) : set);
const PERKED = (role) => Object.assign({}, role === 'healer' || role === 'mage' ? RINGS.casts : RINGS.blows, EARS.both);

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
    misses: count((e) => e.type === 'miss' && !e.dodge && !ids.has(e.t)),
    manaSwings: count((e) => e.type === 'shot' && e.mana > 0),
    heals: count((e) => e.type === 'heal'),
    surgedHeals: count((e) => e.type === 'heal' && e.crit === true),
    casts: count((e) => e.type === 'cast'),
    drinks: events.filter((e) => e.type === 'drink' && (mine(e) || ids.has(e.t))).length,
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
  'earrings-show': (P) => {
    /* Steady at T2: 20% of the basic blows that would miss land (re-sized from 15%, lane/d-jewelry-2b). The miss share must fall by near
       that, never by nothing and never by half. */
    const missOf = (rs) => sum(rs, 'misses') / Math.max(1, sum(rs, 'misses') + sum(rs, 'basics'));
    const steady = SEEDS.map((secret) => play(P, GLADE, 24, ['tank'], { secret, rings: EARS.steady }));
    const plain = SEEDS.map((secret) => play(P, GLADE, 24, ['tank'], { secret, rings: EARS.plain }));
    const cut = 1 - missOf(steady) / Math.max(1e-9, missOf(plain));
    if (!(sum(plain, 'misses') > 100 && cut > 0.1 && cut < 0.3)) return 'Steady cut the miss share ' + (100 * missOf(plain)).toFixed(1) + '% -> ' + (100 * missOf(steady)).toFixed(1) + '%';
    /* Focus at T2: 2% of max mana on each kill; a plain-stud mage gets nothing back. Since plain studs help all three styles (designer
       2026-11-18: +2 Magic attack and strength) a Glade mage's casts no longer wait on mana, so the kill's mana shows in the drinks it
       spares: 37 and 34 a seed with plain studs, 18 and 17 with Focus (lane/d-jewelry-2b). Its hunt XP is the cell harness's (+3.6%). */
    const focus = SEEDS.map((secret) => play(P, GLADE, 24, ['mage'], { secret, rings: EARS.focus }));
    const bare = SEEDS.map((secret) => play(P, GLADE, 24, ['mage'], { secret, rings: EARS.plain }));
    const fewer = sum(focus, 'drinks') / Math.max(1, sum(bare, 'drinks'));
    if (!(sum(bare, 'drinks') > 20 && fewer > 0.3 && fewer < 0.75)) return 'Focus moved a mage\'s drinks ' + sum(bare, 'drinks') + ' -> ' + sum(focus, 'drinks') + ' (casts ' + sum(bare, 'casts') + ' -> ' + sum(focus, 'casts') + ')';
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
    const ears = X.C.equipmentStats(Object.assign(P.kitFor(24, 'tank'), EARS.both), X.ITEMS);
    if (JSON.stringify(ears.jewel) !== JSON.stringify({ steady: 200, focus: 20 })) return 'Hallmarked Fang Studs read ' + JSON.stringify(ears.jewel);
    if (X.C.equipmentStats(Object.assign(P.kitFor(24, 'tank'), EARS.plain), X.ITEMS).jewel !== undefined) return 'plain Fang Studs carry perks';
    return null;
  },
};

const mutants = [
  { name: 'the settle never puts Follow-through on the unit', case: 'perks-show', edits: [['src/core/combat-sim.js', '  if (snap.followPm) u.followPm = snap.followPm; else if (u.followPm) delete u.followPm;\n', '']] },
  { name: 'Keen never reaches the crit chance', case: 'perks-show', edits: [['src/core/combat.js', 'const keen = eq.jewel && eq.jewel.keen ? eq.jewel.keen / 1000 : 0;', 'const keen = 0;']] },
  { name: 'Surge never lands', case: 'perks-show', edits: [['src/core/hunt/abilities.js', 'return u.surgePm > 0 && !!(row.dmg || row.heal || row.shield) && sc.rng.chance(u.surgePm / 1000);', 'return false;']] },
  { name: 'a perk counts once per piece, so two rings stack', case: 'once-per-hero', edits: [['src/core/combat.js', "if (pm > 0 && !(out[k] >= pm)) { out[k] = pm; any = true; }", "if (pm > 0) { out[k] = (out[k] || 0) + pm; any = true; }"]] },
  { name: 'Follow-through draws from the wall clock, so two cuts disagree', case: 'both-paths', edits: [['src/core/hunt/damage.js', 'if (next && sc.rng.chance(u.followPm / 1000))', 'if (next && Math.random() < u.followPm / 1000)']] },
  { name: 'Steady never reaches the accuracy', case: 'earrings-show', edits: [['src/core/combat.js', '  if (steady) accuracy += (1 - accuracy) * steady;', '']] },
  { name: 'Steady adds to the hit chance before the clamp, so a capped hero gets nothing and a low one double', case: 'earrings-show', edits: [['src/core/combat.js', '  if (steady) accuracy += (1 - accuracy) * steady;', '  if (steady) accuracy = Math.min(0.95, accuracy + steady);']] },
  { name: 'the settle never puts Focus on the unit', case: 'earrings-show', edits: [['src/core/combat-sim.js', '  if (snap.focusPm) u.focusPm = snap.focusPm; else if (u.focusPm) delete u.focusPm;\n', '']] },
  { name: 'Focus pays one mana a kill, whatever the max', case: 'earrings-show', edits: [['src/core/hunt/damage.js', 'Math.max(1, Math.floor((max * u.focusPm) / 1000))', '1']] },
  { name: 'a plain ring carries an empty perk map', case: 'plain-draws-nothing', edits: [['src/core/combat.js', '  if (jewel) Object.assign(s, { jewel });', '  Object.assign(s, { jewel: jewel || {} });']] },
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
