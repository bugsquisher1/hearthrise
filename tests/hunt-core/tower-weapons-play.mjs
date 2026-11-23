// tests/hunt-core/tower-weapons-play.mjs — A WORN +SKILL ON THE REAL SETTLE (the Burning Tower's weapons, Tyler 2026-11-14: "+ respective
// combat skill. bronze +1, silver +2, gold +3, plat +4", "it functions like it does in tibia"; src/core/combat.js SKILL_PLUS_FIELDS,
// src/data/tower-weapons.js, src/data/chests.js towerWeaponItems). Run by run-all.mjs.
//
// as-skill-levels  every tower weapon rolls exactly as its standard twin does on a hero N skill levels higher (N = its key's +skill):
//                  accuracy and max hit against every monster of the ground, the snapshot's blow; and every one IS its twin in every
//                  other number (the design's "the same accuracy and damage as the standard weapon of its rank, plus the +skill").
// both-paths       a lone tank, a lone ranger, a lone healer and a four in tower weapons: a watched hunt (10 s settles) and a closed
//                  browser (10 min) play the same hunt, and it is not the hunt their standard twins play.
// spells-grow      a Mage's spell lands at the output of its level PLUS the wand's +skill (abilities.js powerLevel): the first spell hit
//                  of a hero in the tower wand carries the multiplier the standard wand's hero carries two Magic levels up, never its own.
// peers            the browser's copy of a party member (member.js frozenOf / frozenSide) carries the +skill, so its spells grow there too,
//                  while its frozen `lv` stays the BASE level (a rune's version and an ability's unlock read only that).
// defense          a +Defense piece raises the to-hit defence a monster swings against (the snapshot's `def`), and nothing else does.
//
// mutant-anchors: src/core/combat.js src/core/combat-sim.js src/core/member.js src/core/hunt/abilities.js src/data/chests.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';

const V = sourceQuery(ROOT);
const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

const HOUR = 3600000, WARRENS = 'coppercap_warrens', L = 45;
/* spells-grow's own hunt seed (lane/a-cave-walls 2026-11-17): the Warrens' reshaped rows moved which goblin the Mage hits first, and on
   the harness's default seed its first six spells all landed where two Magic levels round to the same hit (tower = twin = twinUp), so the
   case could not tell. On this seed the +2 shows in the first six and both mutants are caught (seeds 1, 7, 42, -1 all do). */
const SPELL_SEED = '7';
/* The Silver Key's weapons (worn at 45, +2) by the role that wields them in the harness (play-ground.mjs kit: a tank holds a sword and a
   shield, a ranger a bow, a healer a staff, a mage a wand and a book) */
const TOWER = Object.freeze({ tank: 'tollkeepers_sword', ranger: 'ferrymans_bow', healer: 'old_ash_rake', mage: 'chandlers_wand', melee_dps: 'quarry_maul' });
const TWIN = Object.freeze({ tank: 'mithril_sword', ranger: 'maple_bow', healer: 'maple_staff', mage: 'maple_wand', melee_dps: 'mithril_warhammer' });
const SKILLS = ['melee', 'ranged', 'magic', 'defense'];
const sorted = (x) => (Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);

/** One span on the real settle: every hero in its ladder kit with `weapon(role)` in the weapon slot, skills at `lv(role)` (default L). */
function play(P, X, roles, o) {
  const ids = new Set(), events = [];
  const r = P.run(WARRENS, L, roles, { spanMs: o.spanMs || HOUR / 4, secret: o.secret || '-4611686018427387904', windowMs: o.windowMs || 600000,
    equipment: (role) => Object.assign(P.kitFor(L, role), { weapon: o.weapon(role) }),
    ...(o.lv ? { start: (role) => ({ skills: Object.fromEntries(SKILLS.map((k) => [k, X.XP.skillXpForLevel(k, o.lv(role, k))])) }) } : {}),
    onWindow: (out) => {
      for (const p of out.members) if (p.hunt && p.hunt.unit_id) ids.add(p.hunt.unit_id);
      for (const e of out.events || []) events.push(e);
    } });
  return { r, events, ids, whole: JSON.stringify(sorted([r.totals, r.members, r.items, r.heroXp])) + JSON.stringify(events) };
}

const cases = {
  'as-skill-levels': (P, X) => {
    const { CH, C, MB, ITEMS, MONSTERS, GT } = X;
    const foes = [{}, ...[...new Set(X.G.HUNT_GROUNDS[WARRENS].pockets.flatMap((p) => p.spawns.map((s) => s.monster)))].map((k) => MONSTERS[k])];
    let n = 0;
    for (const k of CH.CHEST_KEYS) for (const [fam, id] of Object.entries(k.weapons)) {
      const it = ITEMS[id], twinId = GT.WEAPON_FAMILIES.find((f) => f.key === fam).ids[k.weaponTier - 1], twin = ITEMS[twinId];
      const profile = MB.deriveProfile(it.weaponType);
      const skill = profile.accuracySkill;
      /* the same row in every number but its name, its +skill and its lock */
      const { n: _a, iL: _d, towerKey, [C.SKILL_PLUS_FIELDS[skill]]: plus, ...rest } = it;
      /* (`iL` is the piece's item Level: the twin's can be a scale ground's mark, src/data/danger.js scaleItemLevels, and a Tower weapon drops on none) */
      const { n: _b, iL: _c, ...twinRest } = twin;
      if (JSON.stringify(sorted(rest)) !== JSON.stringify(sorted(twinRest))) return id + ' is not ' + twinId + ' in its other numbers';
      if (plus !== k.skillPlus || towerKey !== k.id) return id + ' gives +' + plus + ' ' + skill + ' from ' + towerKey + ', the key says +' + k.skillPlus;
      let better = false;
      for (const S of [1, 30, 45, 88]) {
        const at = (lv) => Object.fromEntries(SKILLS.map((s) => [s, X.XP.skillXpForLevel(s, lv)]));
        const mine = { weapon: id }, theirs = { weapon: twinId };
        for (const m of foes) {
          const a = C.playerCombatRolls(m, { equipment: mine, items: ITEMS, skills: at(S), profile });
          const b = C.playerCombatRolls(m, { equipment: theirs, items: ITEMS, skills: { ...at(S), [skill]: X.XP.skillXpForLevel(skill, S + k.skillPlus) }, profile });
          if (a.accuracy !== b.accuracy || a.maxHit !== b.maxHit) return `${id} at ${skill} ${S} rolls ${a.accuracy}/${a.maxHit}, ${twinId} at ${S + k.skillPlus} rolls ${b.accuracy}/${b.maxHit}`;
          n++;
        }
        /* against the ground's monsters (a foe with no evasion is the to-hit rail for both, src/data/to-hit.js): a skill level moves the max hit
           in whole steps (combat.js: 0.35 a level) and the to-hit by the ratio, so +N shows at some levels and not others */
        for (const m of foes) {
          const plain = C.playerCombatRolls(m, { equipment: theirs, items: ITEMS, skills: at(S), profile });
          const tower = C.playerCombatRolls(m, { equipment: mine, items: ITEMS, skills: at(S), profile });
          if (tower.maxHit > plain.maxHit || tower.accuracy > plain.accuracy) better = true;
          if (tower.maxHit < plain.maxHit || tower.accuracy < plain.accuracy) return `${id} rolls worse than ${twinId} at ${skill} ${S}`;
        }
      }
      if (!better) return `${id} rolls no better than ${twinId} at any sampled ${skill} level`;
    }
    return n > 0 ? null : 'no tower weapon was rolled';
  },
  'both-paths': (P, X) => {
    for (const roles of [['tank'], ['ranger'], ['healer'], ['tank', 'healer', 'ranger', 'mage']]) {
      const viewed = play(P, X, roles, { windowMs: 10000, weapon: (r) => TOWER[r] });
      const closed = play(P, X, roles, { windowMs: 600000, weapon: (r) => TOWER[r] });
      if (viewed.whole !== closed.whole) return roles.join('+') + ': a watched hunt and a closed browser disagree';
      const twin = play(P, X, roles, { windowMs: 600000, weapon: (r) => TWIN[r] });
      if (twin.whole === closed.whole) return roles.join('+') + ': the +skill changed nothing on this hunt';
    }
    return null;
  },
  'spells-grow': (P, X) => {
    /* the Mage's first spell hits (ability, amount), on one seed: a hero whose every roll and every spell's output is the same draws
       the same dice, so the tower wand at Magic L lands the plain wand's hits at Magic L+2 (until a skill level-up parts them) */
    const first = (o) => {
      const p = play(P, X, ['mage'], { spanMs: HOUR / 12, secret: SPELL_SEED, ...o });
      return p.events.filter((x) => x.type === 'dmg' && p.ids.has(x.u) && x.ability && x.ability !== 'basic').slice(0, 6)
        .map((x) => x.ability + ':' + x.amount).join(' ');
    };
    const tower = first({ weapon: () => TOWER.mage });
    const twin = first({ weapon: () => TWIN.mage });
    const twinUp = first({ weapon: () => TWIN.mage, lv: (role, k) => (k === 'magic' ? L + 2 : L) });
    if (tower.split(' ').length < 6) return 'the Mage landed under six spell hits: ' + tower;
    if (tower !== twinUp) return 'the tower wand\'s spells landed ' + tower + ', the plain wand\'s two Magic levels up ' + twinUp;
    if (tower === twin) return 'the tower wand\'s spells landed as the plain wand\'s at the same level: ' + tower;
    return null;
  },
  'peers': (P, X) => {
    const { MB, ITEMS, MONSTERS } = X;
    const mi = (weapon) => ({ key: 'a', seat: 0, equipment: { weapon }, skills: Object.fromEntries(SKILLS.map((s) => [s, X.XP.skillXpForLevel(s, L)])),
      levelXp: X.XP.charXpForLevel(L), hp: 1000, gold: 0, hero: { role: 'mage', slots: [{ slot: { action: { type: 'ability', id: 'fireball' } } }] } });
    const side = MB.memberSide(mi(TOWER.mage), { items: ITEMS });
    if (JSON.stringify(side.member.skillPlus) !== JSON.stringify({ magic: 2 })) return 'the member carries ' + JSON.stringify(side.member.skillPlus);
    const fr = MB.frozenOf(side, [], 0, MONSTERS);
    if (JSON.stringify(fr.snap.skillPlus) !== JSON.stringify({ magic: 2 })) return 'the frozen row carries ' + JSON.stringify(fr.snap.skillPlus);
    for (const [k, lv] of Object.entries(fr.lv)) if (lv !== L) return 'the frozen ' + k + ' level is ' + lv + ', the base is ' + L;
    const peer = MB.frozenSide({ key: 'a', seat: 0, unitId: 1, frozen: fr }).member;
    if (JSON.stringify(peer.skillPlus) !== JSON.stringify({ magic: 2 })) return 'the browser\'s peer carries ' + JSON.stringify(peer.skillPlus);
    const plain = MB.memberSide(mi(TWIN.mage), { items: ITEMS });
    if (plain.member.skillPlus !== null || MB.frozenOf(plain, [], 0, MONSTERS).snap.skillPlus !== undefined) return 'a plain wand carries a +skill';
    if (X.C.equipmentStats({ weapon: TWIN.mage }, ITEMS).skillPlus !== undefined) return 'a plain wand\'s stats name a +skill';
    return null;
  },
  'defense': (P, X) => {
    const { MB, ITEMS } = X;
    /* a test-only shield: the Coppercap's row with +3 Defense (no shipped item gives Defense yet) */
    const items = { ...ITEMS, test_guard: { ...ITEMS.coppercap_shield, n: 'Test Guard', defensePlus: 3 } };
    const snap = (shield) => {
      const s = MB.memberSide({ key: 'a', equipment: { weapon: 'mithril_sword', shield }, skills: Object.fromEntries(SKILLS.map((k) => [k, X.XP.skillXpForLevel(k, L)])),
        levelXp: X.XP.charXpForLevel(L), hp: 1000, hero: { role: 'tank' } }, { items });
      return s.member.snapshot(s.state);
    };
    const a = snap('coppercap_shield'), b = snap('test_guard');
    if (b.def !== a.def + 3) return 'a +3 Defense shield moved the defence from ' + a.def + ' to ' + b.def;
    if (b.acc !== a.acc || b.maxHit !== a.maxHit) return 'a +Defense piece moved the blow';
    return null;
  },
};

const mutants = [
  { name: 'a worn +skill never reaches a blow', case: 'as-skill-levels', edits: [['src/core/combat.js',
    'const accLvl = levelOf(skills, profile.accuracySkill) + skillPlusOf(eq, profile.accuracySkill);', 'const accLvl = levelOf(skills, profile.accuracySkill);'],
  ['src/core/combat.js', 'const dmgLvl = levelOf(skills, profile.damageSkill) + skillPlusOf(eq, profile.damageSkill);', 'const dmgLvl = levelOf(skills, profile.damageSkill);']] },
  { name: 'the worn set never sums its +skill', case: 'both-paths', edits: [['src/core/combat.js', '  if (plus) Object.assign(s, { skillPlus: plus });', '']] },
  { name: 'a tower weapon hits harder than its twin', case: 'as-skill-levels', edits: [['src/data/chests.js', 'out[w.id] = { ...base, n: w.name,', 'out[w.id] = { ...base, strB: (base.strB || 0) + 1, n: w.name,']] },
  /* THE SPELL RULE (lane/c-spell-rule): a spell is a share of its caster's blow, so the +skill reaches it through the blow alone */
  { name: 'a spell reads the base level only (the +skill never reaches the blow)', case: 'spells-grow', edits: [['src/core/combat.js',
    '  const dmgLvl = levelOf(skills, profile.damageSkill) + skillPlusOf(eq, profile.damageSkill);', '  const dmgLvl = levelOf(skills, profile.damageSkill);']] },
  { name: 'a peer\'s frozen row drops the +skill', case: 'peers', edits: [['src/core/member.js', ', ...(snap.skillPlus ? { skillPlus: snap.skillPlus } : {}) });', ' });']] },
  { name: 'the frozen level reads the +skill', case: 'peers', edits: [['src/core/member.js',
    'for (const k of engineSkillsOf(m.hero.slots)) lv[k] = levelOf(m.state.skills, k);', 'for (const k of engineSkillsOf(m.hero.slots)) lv[k] = levelOf(m.state.skills, k) + ((m.skillPlus || {})[k] || 0);']] },
  { name: 'a +Defense piece never reaches the to-hit roll', case: 'defense', edits: [['src/core/member.js',
    "(Number(levelsOf(state.skills).defense) || 1) + skillPlusOf(c.eq, 'defense') + (Number(c.eq.guardB) || 0)", '(Number(levelsOf(state.skills).defense) || 1) + (Number(c.eq.guardB) || 0)']] },
];

const R = makeReport('hunt-core/tower-weapons-play');
const load = async (root) => {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  return { P: await loadPlay(root), X: { C: await imp('src/core/combat.js'), MB: await imp('src/core/member.js'), XP: await imp('src/core/xp.js'),
    CH: await imp('src/data/chests.js'), GT: await imp('src/data/gear-tiers.js'), G: await imp('src/data/hunt-grounds.js'),
    ITEMS: (await imp('src/data/items.js')).ITEMS, MONSTERS: (await imp('src/data/monsters.js')).MONSTERS } };
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
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
R.finish();
