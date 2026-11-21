// tests/hunt-core/fist-play.mjs — THE FIST LINE'S SAMPLE ON THE REAL SETTLE (src/data/fists.js; itemization plan §7, phase 1).
// Run by run-all.mjs.
//
// The sample is HIDDEN (FIST_LINE.live false), so every case but `hidden` plays a planted copy with the switch on: the rows as written,
// through the settle the world tick runs. The two engine pieces it stands on are tested here on the dice and in their own modules' files
// (pull-cycle.mjs own-heal: the heal's arithmetic; damage.mjs weak-share: half a weakness).
//
// hidden        the repo as shipped holds no fist row: no item, discipline, role key, family skill or strike, and Power Strike is the
//               four Melee lists' only (nothing a generated catalogue reads moves while the sample is off)
// sample-rows   with the switch on every table validates, the wraps play the fist list as a Melee seat, and both strikes name Magic
// both-paths    a lone fist and a four with one, a watched hunt (10 s settles) and a closed browser (10 min) land every blow, strike,
//               heal and coin alike; the fist casts its strikes; and its own heal changes the hunt (the same hero with the wraps'
//               heal taken off eats more)
// own-skill     AN ABILITY NAMING ITS OWN SKILL: Charged Hands lands harder at Magic 40 than at Magic 1 (its numbers read Magic, not
//               Melee), and its hits train no Melee while the wraps' blows and Power Strike do (Magic is paid per mana)
//
// mutant-anchors: src/data/abilities.js src/core/hunt-rewards.js src/core/combat-sim.js src/core/member.js src/core/combat.js src/core/hunt/pull-cycle.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';

const V = sourceQuery(ROOT);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

const HOUR = 3600000, GLADE = 'mosslight_glade', L = 24;
const LIVE = ['src/data/fists.js', 'live: false,', 'live: true,'];
const TREES = [...PLAY_TREES, 'tests/hunt-core/fixtures'];
/* A fist at the Glade wears the tier-2 wraps in Studded Leather; every other seat the fixture's kit. */
const FIST_SET = Object.freeze({ weapon: 'sluicers_knuckles', helmet: 'studded_helmet', body: 'studded_body', pants: 'studded_pants', boots: 'studded_boots' });
const sorted = (x) => (Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);

/** One span on the real settle. `roles` the party's hunt roles, `fistSeat` the seat that wears the wraps, `bar` the fist's stored ability lane. */
function play(X, roles, o) {
  const P = X.P, ids = new Set(), events = [];
  const slot = (id, conds) => ({ id: 'd_' + id, action: { type: 'ability', id }, conditions: conds || [], join: 'and' });
  const fistBar = () => [slot('ice_hands'), slot('power_strike'), slot('mend', [{ metric: 'self_hp_pct', op: 'lt', value: 50 }])];
  const r = P.run(GLADE, L, roles, { spanMs: o.spanMs || HOUR / 4, secret: o.secret || '-4611686018427387904', windowMs: o.windowMs || 600000,
    equipment: (role, seat) => (seat === o.fistSeat ? { ...FIST_SET } : P.kitFor(L, role)),
    ...(o.start ? { start: o.start } : {}), xpFrac: true,
    /* the fist's own lane beside the ground's food and drink (the reference bar's three slots) */
    bar: (role, seat) => (seat === o.fistSeat ? P.refBar(GLADE).concat(fistBar()) : P.refBar(GLADE)),
    onWindow: (out) => {
      for (const p of out.members) if (p.hunt && p.hunt.unit_id) ids.add(p.hunt.unit_id);
      for (const e of out.events || []) events.push(e);
    } });
  return { r, events, whole: JSON.stringify(sorted([r.totals, r.members, r.items, r.heroXp])) + JSON.stringify(events) };
}

const cases = {
  hidden: (X) => {
    const S = X.shipped;
    const leaks = [];
    if (S.FISTS.FIST_LINE.live !== false) leaks.push('the switch is on');
    for (const id of Object.keys(S.FISTS.FIST_ITEMS)) if (S.ITEMS[id]) leaks.push('ITEMS.' + id);
    if (S.AD.DISCIPLINES.fists) leaks.push('DISCIPLINES.fists');
    if (S.HR.ROLE_KEYS.fists) leaks.push('ROLE_KEYS.fists');
    if (S.SK.FAMILY_SKILL.fists || S.SK.DAMAGE_XP_FAMILIES.includes('fists')) leaks.push('the fists family skill');
    for (const r of Object.values(S.AD.ABILITIES)) if (r.disciplines.includes('fists') || /_(hands|palm)$/.test(r.id)) leaks.push('ABILITIES.' + r.id);
    return leaks.length ? 'the hidden sample shows in the shipped tables: ' + leaks.join(', ') : null;
  },
  'sample-rows': (X) => {
    const { AD, HR, ITEMS } = X;
    const bad = AD.validate().concat(HR.validate());
    if (bad.length) return 'with the sample live the tables refuse it: ' + bad.join('; ');
    const list = AD.disciplineAbilities('fists');
    for (const want of ['power_strike', 'fire_hands', 'ice_hands', 'poison_hands', 'fire_palm', 'ice_palm', 'poison_palm', 'mend']) if (!list.includes(want)) return 'the fist list lacks ' + want + ': ' + list;
    if (list.some((id) => AD.ABILITIES[id].target !== 'enemy' && id !== 'mend')) return 'a fist ability strikes more than one target: ' + list;
    for (const id of ['practice_wraps', 'sluicers_knuckles']) {
      const it = ITEMS[id];
      if (!it || HR.wornRoleKey({ weapon: id }, ITEMS) !== 'fists' || HR.roleForWeapon('fists') !== 'melee_dps' || it.twoHanded !== true) return id + ' does not play the fist list as a Melee seat';
    }
    for (const id of list.filter((x) => /_(hands|palm)$/.test(x))) {
      const r = AD.ABILITIES[id];
      if (AD.abilitySkill(r) !== 'magic' || AD.ownHitSkill(r) !== null || r.weakPm !== 500) return id + ' does not name Magic as its own skill with half a weakness';
    }
    return AD.ownHitSkill(AD.ABILITIES.power_strike) === undefined && AD.ownHitSkill(AD.ABILITIES.mend) === undefined ? null : 'a row with no own skill reads one';
  },
  'both-paths': (X) => {
    for (const [roles, fistSeat] of [[['melee_dps'], 0], [['tank', 'healer', 'mage', 'melee_dps'], 3]]) {
      const viewed = play(X, roles, { fistSeat, windowMs: 10000 });
      const closed = play(X, roles, { fistSeat, windowMs: 600000 });
      if (viewed.whole !== closed.whole) return roles.join('+') + ': a watched hunt and a closed browser disagree';
      const strikes = closed.events.filter((e) => e.type === 'cast' && e.ability === 'ice_hands').length;
      if (strikes < 20) return roles.join('+') + ': the fist cast Charged Hands ' + strikes + ' times in a quarter hour';
    }
    /* THE OWN HEAL CHANGES THE HUNT: the same lone fist with the wraps' heal taken off (this copy's catalogue, put back after) */
    const withHeal = play(X, ['melee_dps'], { fistSeat: 0, spanMs: HOUR });
    const row = X.P.ITEMS.sluicers_knuckles;
    X.P.ITEMS.sluicers_knuckles = Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'selfHealPm'));
    let without;
    try { without = play(X, ['melee_dps'], { fistSeat: 0, spanMs: HOUR }); } finally { X.P.ITEMS.sluicers_knuckles = row; }
    const eaten = (p) => Object.values(p.r.totals.buys).reduce((s, b) => s + Object.entries(b).filter(([id]) => /salted_/.test(id)).reduce((a, [, n]) => a + n, 0), 0);
    if (!(eaten(without) > eaten(withHeal) + 5)) return 'the own heal saved no food: ' + eaten(withHeal) + ' with it, ' + eaten(without) + ' without';
    return null;
  },
  'own-skill': async (X) => {
    /* its numbers read MAGIC: Charged Hands' mean hit at Magic 40 against Magic 1, every other skill at the Level */
    const at = (magic, melee) => {
      const p = play(X, ['melee_dps'], { fistSeat: 0, spanMs: HOUR / 2,
        start: () => ({ skills: { melee: X.XP.skillXpForLevel('melee', melee), ranged: X.XP.skillXpForLevel('ranged', L), magic: X.XP.skillXpForLevel('magic', magic), defense: X.XP.skillXpForLevel('defense', L) } }) });
      const hits = p.events.filter((e) => e.type === 'dmg' && e.ability === 'ice_hands' && e.u === 1 && e.amount > 0);
      return hits.length ? hits.reduce((s, e) => s + e.amount, 0) / hits.length : 0;
    };
    const low = at(1, L), high = at(40, L), strong = at(1, 40);
    if (!(low > 0 && high > low * 1.25)) return 'Charged Hands at Magic 40 lands ' + high.toFixed(1) + ', at Magic 1 ' + low.toFixed(1) + ': it does not read Magic';
    if (!(Math.abs(strong / low - 1) < 0.1)) return 'Charged Hands moved with Melee: ' + low.toFixed(1) + ' at Melee ' + L + ', ' + strong.toFixed(1) + ' at Melee 40';
    /* its hits train no Melee (Magic is paid per mana); the wraps' blows and Power Strike train Melee */
    const rw = await import(pathToFileURL(join(X.root, 'src/core/hunt-rewards.js')).href + V);
    const got = { level: 0 };
    const member = { family: 'fists', armoured: false, shield: false, bonus: () => 0, weakness: () => ({ dropMult: 1 }), state: { stats: {} }, hs: { tally: { kills: 0 } },
      fx: { addXp: (k, n) => { got[k] = (got[k] || 0) + n; }, addLevelXp: (n) => { got.level += n; } } };
    const w = { units: [{ id: 1, side: 'hero', alive: true }, { id: 9, side: 'mon', kind: 'rat', alive: true, hp: 99 }] };
    rw.rewardSwing(new Map([[1, member]]), [{ type: 'dmg', u: 1, t: 9, amount: 11, ability: 'ice_hands' }, { type: 'dmg', u: 1, t: 9, amount: 5, ability: 'basic' },
      { type: 'dmg', u: 1, t: 9, amount: 3, ability: 'power_strike' }], w, { rng: { int: (a) => a, chance: () => false } });
    const per = X.CX.hitXpPerDamage;
    return got.melee === 8 * per && !got.magic && !got.ranged ? null : 'a fist\'s blows paid ' + JSON.stringify(got) + ', want Melee ' + 8 * per + ' (5 + 3) and nothing for the 11 of Charged Hands';
  },
};

const mutants = [
  { name: 'an ability\'s own skill is read only on a universal row', case: 'own-skill',
    edits: [['src/data/abilities.js', "export const abilitySkill = (row) => (row && typeof row.skill === 'string' && row.skill) ||", "export const abilitySkill = (row) => (row && row.universal && row.skill) ||"]] },
  { name: 'the settle pays a strike\'s hits to the weapon\'s skill', case: 'own-skill',
    edits: [['src/core/hunt-rewards.js', "const own = ownHitSkill(typeof abilityId === 'string' ? ABILITIES[abilityId] : null);", 'const own = undefined;']] },
  { name: 'a Magic strike\'s hits train Magic by damage too', case: 'own-skill',
    edits: [['src/data/abilities.js', "(row.skill === 'magic' ? null : row.skill)", 'row.skill']] },
  { name: 'the settle never puts the own heal on the unit', case: 'both-paths',
    edits: [['src/core/combat-sim.js', '  if (snap.selfHealPm) u.selfHealPm = snap.selfHealPm; else if (u.selfHealPm) delete u.selfHealPm;\n', '']] },
  { name: 'the snapshot drops the own heal', case: 'both-paths',
    edits: [['src/core/member.js', '...(skillPlus ? { skillPlus } : {}), ...(selfHealPm ? { selfHealPm } : {}) };', '...(skillPlus ? { skillPlus } : {}) };']] },
  { name: 'the own heal rolls on the wall clock\'s dice, so two cuts disagree', case: 'both-paths',
    edits: [['src/core/hunt/pull-cycle.js', '? h.selfHealPm * 1000 : 0;', '? Math.floor(h.selfHealPm * 2000 * Math.random()) : 0;']] },
  { name: 'the sample leaks into the shipped catalogue', case: 'hidden',
    edits: [['src/data/items.js', '...(FIST_LINE.live ? FIST_ITEMS : {}),', '...FIST_ITEMS,']] },
];

const R = makeReport('hunt-core/fist-play');
/* `root` played with the sample live (the planted copy); `shipped` the repo as it is. */
async function load(root) {
  const { loadPlay } = await import(pathToFileURL(join(root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const imp = (r, p) => import(pathToFileURL(join(r, p)).href + V);
  const P = await loadPlay(root);
  return { root, P, AD: await imp(root, 'src/data/abilities.js'), HR: await imp(root, 'src/data/hunt-roles.js'), ITEMS: (await imp(root, 'src/data/items.js')).ITEMS,
    XP: await imp(root, 'src/core/xp.js'), CX: (await imp(root, 'src/data/core-model.js')).COMBAT_XP,
    shipped: { FISTS: await imp(ROOT, 'src/data/fists.js'), ITEMS: (await imp(ROOT, 'src/data/items.js')).ITEMS, AD: await imp(ROOT, 'src/data/abilities.js'),
      HR: await imp(ROOT, 'src/data/hunt-roles.js'), SK: await imp(ROOT, 'src/data/skills.js') } };
}
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const home = plant([LIVE], TREES);
try {
  const X = await load(home.root);
  for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
    let why = null;
    try { why = await fn(X); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
} finally { home.done(); }
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  /* the `hidden` case reads the shipped tables, so its mutant plants into a copy it reads as the shipped one */
  const shippedMutant = mu.case === 'hidden';
  const p = plant(shippedMutant ? mu.edits : [LIVE, ...mu.edits], TREES);
  try {
    let why = null;
    try {
      const X = await load(p.root);
      if (shippedMutant) X.shipped = { FISTS: await import(pathToFileURL(join(p.root, 'src/data/fists.js')).href + V), ITEMS: X.ITEMS, AD: X.AD, HR: X.HR,
        SK: await import(pathToFileURL(join(p.root, 'src/data/skills.js')).href + V) };
      why = await cases[mu.case](X);
    } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
R.finish();
