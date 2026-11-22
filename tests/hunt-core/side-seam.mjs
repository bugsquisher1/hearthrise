// tests/hunt-core/side-seam.mjs — THE SIDE SEAM (src/core/hunt/sides.js; redesign 02-architecture §7b, wave 1's first engine batch).
// Run by run-all.mjs.
//
// Every unit fights on a side; "enemy" is "not my side" and "ally" is "my side", asked through sides.js, while what a unit IS (a
// hero's bar and gear, a monster's row) is asked by kind. In a hunt the two coincide, so a site that decides friend or foe by KIND
// plays every hunt exactly as one that decides by SIDE (tests/hunt-core/engine-parity.mjs holds those pins). These cases put a
// unit on the other side from its kind, where the two answers part, and read which one the engine gave:
//
//   no-raw-kind-reads       no module of src/core compares a unit's kind field (`.side`) itself: sides.js is the one door
//   a-turncoat-is-fought    a tiny scripted fight on the one engine (world-step.js stepSwing, indexed as every swing is): a hero
//                           placed on the ground's side is fought by the company hero beside it and fights back; a monster placed
//                           on the company's side, beside both, is never struck by the company; a follow-through lands on the
//                           ground's monster beside the turncoat, never on the company's own
//   the-bar-reads-sides     the bar's lists, on the plain scan and on the swing's index: an area aim counts foes, "allies below"
//                           counts the company (not a hurt turncoat), Follow follows the leader onto a turncoat, ALONE is alone
//                           with only a turncoat beside it
//   kill-pays-its-winners   a kill pays the living heroes not on the fallen's side: a turncoat standing by is paid nothing
//   spells-know-sides       a monster's group strike lands on its foes (the company's monster too), never on a turncoat beside
//                           them; a spell may start at a company monster; a mend takes a hurt packmate of the ground, never a
//                           more-hurt company monster in the pocket
//   heals-know-sides        a healer's party heal waits while only a turncoat beside it is hurt; its ally heal takes the hurt
//                           tank, never the more-hurt turncoat
//   a-shooter-aims-at-foes  a shooter aims at the farthest FOE in its pack's area, never at a farther turncoat
//
// The mutants put each seam site back to deciding by kind, one at a time, and the case reading it must go red.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT, hero, mon, world, instOf } from './fixtures/h1.js';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { supplySession } from './fixtures/h4.js';

/* The hunt core, and the seam's own modules from the same root (a planted copy for a mutant). */
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + sourceQuery(root));
  M.sides = await imp('src/core/hunt/sides.js');
  M.MS = await imp('src/data/monster-spells.js');
  M.spells = await imp('src/core/hunt/monster-spells.js');
  M.shooters = await imp('src/core/hunt/shooters.js');
  return M;
}

const COMPANY = 'hero'; const GROUND = 'mon';
const H = (M, id, x, y, role, o) => hero(M, id, x, y, Object.assign({ kind: role, role, dist: 1, chase: true, tmode: 'nearest', stance: 'balanced',
  acc: 1000, maxHit: 6, def: 0, hp: 500, maxHp: 500 }, o || {}));
/* A unit PLACED on a side: `team` is set after makeUnit (it is a working value of the span, never persisted: sides.js). */
const placed = (u, side) => Object.assign(u, { team: side });
const fightOf = (M, units) => {
  const w = world(M, units, { phase: 'fight', leader: 1, packs: [{ aggro: true, holder: 1 }, { aggro: false, holder: null }, { aggro: false, holder: null }] });
  return Object.assign(instOf(M, w), { makeUnit: M.worldstate.makeUnit });
};
const recorder = (M, seed) => {
  const events = [];
  return { atMs: 0, dtMs: 100, swing: 0, rng: M.rng.createRng(M.rng.hashSeed('side-seam', seed)), events, emit: (e) => events.push(e), track: () => {} };
};
/* Both ways the engine reads its lists: the plain scan (a settle's read between swings) and the swing's index (unit-index.js). */
const bothWays = (inst, fn) => {
  const plain = fn(Object.assign({}, inst, { indexed: false, ix: null }));
  const indexed = fn(Object.assign({}, inst, { indexed: true, ix: null }));
  return plain === indexed ? plain : 'the plain scan answered ' + JSON.stringify(plain) + ', the swing index ' + JSON.stringify(indexed);
};

/* THE FIXTURE SPELLS (test rows planted on the engine's own table for one case, then removed: tests/hunt-core/monster-spells.mjs's way). */
const GROUP = Object.freeze({ id: 't_seam_group', n: 'Seam Group', shape: 'group', range: 1, windupMs: 1600, cdMs: 10000, hitPm: 1500, element: null });
const MEND = Object.freeze({ id: 't_seam_mend', n: 'Seam Mend', shape: 'mend', range: 3, windupMs: 1200, cdMs: 6000, hitPm: 1000, element: null });
function withSpells(M, rows, kinds, fn) {
  const T = M.MS.MONSTER_SPELLS; const keep = [];
  const live = M.MS.SPELL_SWITCH.live; const span = M.MS.SPELL_STAGGER.spanPm;
  M.MS.SPELL_SWITCH.live = true; M.MS.SPELL_STAGGER.spanPm = 0;
  for (const r of rows) T[r.id] = Object.assign({}, r);
  for (const [k, ids] of Object.entries(kinds)) {
    keep.push([k, Object.prototype.hasOwnProperty.call(M.MONSTERS[k], 'spells'), M.MONSTERS[k].spells]);
    M.MONSTERS[k].spells = ids;
  }
  try { return fn(); } finally {
    M.MS.SPELL_SWITCH.live = live; M.MS.SPELL_STAGGER.spanPm = span;
    for (const r of rows) delete T[r.id];
    for (const [k, had, v] of keep) { if (had) M.MONSTERS[k].spells = v; else delete M.MONSTERS[k].spells; }
  }
}

const cases = {
  /* THE ONE DOOR: a unit's kind field is compared in sides.js alone (a comment may name it). */
  'no-raw-kind-reads': (M) => {
    const bad = [];
    const dir = join(M.root, 'src/core');
    for (const f of readdirSync(dir, { recursive: true }).map(String).filter((x) => x.endsWith('.js')).sort()) {
      const rel = 'src/core/' + f.replace(/\\/g, '/');
      if (rel === 'src/core/hunt/sides.js') continue;
      readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (/\.side\s*[!=]==|[!=]==\s*\w+\.side\b|livingOf\(inst, '(hero|mon)'\)/.test(line)) bad.push(rel + ':' + (i + 1) + '  ' + t.slice(0, 100));
      });
    }
    return bad.length ? bad.length + ' raw read(s) of the kind field outside sides.js: ' + bad.slice(0, 4).join(' | ') : null;
  },

  /* A TINY SCRIPTED FIGHT on the one engine. 1 a company hero (a follow-through on every landed blow), 3 a hero placed on the ground's
     side beside it, 5 a monster placed on the company's side beside both (it holds the turncoat), 6 a ground monster beside the
     turncoat, on the hero. The monsters stand where they are (their walk never completes). */
  'a-turncoat-is-fought': (M) => {
    const units = [
      /* (the perk is the settle's working value at every boundary, combat-sim.js syncUnit: set on the made unit) */
      Object.assign(H(M, 1, 12, 3, 'melee_dps'), { followPm: 1000 }),
      placed(H(M, 3, 13, 3, 'melee_dps', { target: 1 }), GROUND),
      placed(mon(M, 5, 0, 13, 4, { kind: 'slime', target: 3, hp: 99999, maxHp: 99999, speed: 1e9 }), COMPANY),
      mon(M, 6, 0, 14, 3, { target: 1, hp: 99999, maxHp: 99999, speed: 1e9 }),
    ];
    const inst = fightOf(M, units);
    const events = [];
    for (let s = 0; s < 3; s++) {
      events.push(...M.worldstep.stepSwing(inst.world, { ground: inst.ground, grid: inst.grid, heroes: null, swingMs: 2000, atMs: s * 2000,
        rng: M.rng.createRng(M.rng.hashSeed('side-seam-fight', s)) }).events);
    }
    const blows = (u, t) => events.filter((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === u && e.t === t && !e.follow).length;
    const follows = events.filter((e) => e.type === 'dmg' && e.u === 1 && e.follow === true).map((e) => e.t);
    if (!blows(1, 3)) return 'the company hero never swung at the hero placed on the ground\'s side beside it (its target ' + units[0].target + ')';
    if (blows(1, 5)) return 'the company hero struck the monster placed on its own side';
    if (!blows(3, 1)) return 'the turncoat never swung back at the company hero (its target ' + units[1].target + ')';
    if (!follows.length || follows.some((t) => t !== 6)) return 'the follow-through did not land on the ground monster beside the turncoat alone: ' + JSON.stringify(follows);
    return null;
  },

  /* THE BAR'S LISTS: 1 the leader on the turncoat, 2 a company healer, 3 a turncoat at 2% HP holding 1, 5 a company monster at full
     HP holding 3, 6 a ground monster on 1 and out of reach. */
  'the-bar-reads-sides': (M) => {
    const S = M.sides;
    if (S.sideOf(placed(H(M, 9, 1, 1, 'tank'), GROUND)) !== GROUND || S.sideOf(H(M, 9, 1, 1, 'tank')) !== COMPANY) return 'sideOf does not read a placed side';
    const fresh = () => fightOf(M, [
      H(M, 1, 12, 3, 'melee_dps', { target: 3 }),
      H(M, 2, 11, 3, 'healer'),
      placed(H(M, 3, 13, 3, 'melee_dps', { target: 1, hp: 10 }), GROUND),
      placed(mon(M, 5, 0, 13, 4, { kind: 'slime', target: 3 }), COMPANY),
      mon(M, 6, 0, 16, 5, { target: 1 }),
    ]);
    const inst = fresh();
    const [h1, h2] = inst.world.units;
    const aim = bothWays(inst, (i) => { const b = M.conditions.bestAim(i, h1, 1, 3, null); return b ? b.aim.id + 'x' + b.count : 'none'; });
    if (aim !== '3x1') return 'an area aim beside the company hero read ' + aim + ', want the turncoat (3) alone';
    const below = bothWays(inst, (i) => M.conditions.testSlot(i, h2, { hs: null, range: 3, items: null },
      { action: { type: 'ability', id: 'mend' }, conditions: [{ metric: 'allies_below', op: 'gte', value: 1, subject: 'under_50' }], join: 'and' }).pass);
    if (below !== false) return '"allies below 50%" counted the hurt turncoat as the healer\'s ally (' + below + ')';
    const party = bothWays(inst, (i) => { const c = { inst: i, u: h2, h: null, slot: null }; return M.conditions.holds(c, { metric: 'party_hp_pct', op: 'gte', value: 100 }); });
    if (party !== true) return 'the party\'s pooled HP counted the hurt turncoat (' + party + ')';
    const follow = bothWays(inst, (i) => M.targeting.followed(i, h2));
    if (follow !== 3) return 'Follow did not follow the leader onto the turncoat: ' + follow;
    const lone = fightOf(M, [H(M, 1, 12, 3, 'melee_dps'), placed(H(M, 3, 13, 3, 'melee_dps'), GROUND)]);
    if (M.abilities.aloneIn(lone.world, lone.world.units[0]) !== true) return 'a company hero beside only a turncoat is not ALONE';
    if (M.abilities.aloneIn(inst.world, h1) !== false) return 'a company hero with a healer beside it reads ALONE';
    return null;
  },

  /* WHAT A KILL PAYS: the ground monster 6 falls to 1; 2 is the company's, 3 a living turncoat. */
  'kill-pays-its-winners': (M) => {
    const units = [H(M, 1, 12, 3, 'melee_dps'), H(M, 2, 11, 3, 'healer'), placed(H(M, 3, 13, 3, 'melee_dps'), GROUND),
      mon(M, 6, 0, 14, 3, { alive: false, hp: 0 })];
    const inst = Object.assign(fightOf(M, units), { indexed: false });
    const sc = recorder(M, 1);
    const paid = Object.keys(M.xpshare.shareKillXp(inst, { t: 6, u: 1, xp: 100 }, sc)).map(Number).sort((a, b) => a - b);
    return JSON.stringify(paid) === '[1,2]' ? null : 'a kill of the ground\'s monster paid ' + JSON.stringify(paid) + ', want the company [1,2]';
  },

  /* A MONSTER'S SPELLS: 10 a ground rat holding 1 (a group strike), 11 a ground rat holding the company's monster 5 (the same strike),
     12 a ground slime mender in the pocket (its packmate 10 is hurt; the company's monster 5 is more hurt). */
  'spells-know-sides': (M) => {
    return withSpells(M, [GROUP, MEND], { rat: [GROUP.id], slime: [MEND.id] }, () => {
      const units = [
        H(M, 1, 12, 3, 'tank'),
        placed(H(M, 3, 13, 2, 'melee_dps'), GROUND),
        placed(mon(M, 5, 0, 15, 4, { kind: 'slime', target: null, hp: 10, maxHp: 100 }), COMPANY),
        mon(M, 10, 0, 13, 3, { target: 1, hp: 60000, maxHp: 99999 }),
        mon(M, 11, 0, 16, 4, { target: 5, hp: 99999, maxHp: 99999 }),
        mon(M, 12, 0, 14, 4, { kind: 'slime', target: 1, hp: 99999, maxHp: 99999 }),
      ];
      const inst = fightOf(M, units);
      const sc = recorder(M, 2);
      for (let i = 0; i <= 20; i++) {
        sc.atMs = i * 100;
        M.movement.occupancy(inst);
        M.spells.castSpells(inst, sc);
        M.spells.dropCasts(inst, sc);
      }
      const struck = [...new Set(sc.events.filter((e) => e.type === 'dmg' && e.ability === GROUP.id && e.u === 10).map((e) => e.t))].sort((a, b) => a - b);
      if (JSON.stringify(struck) !== '[1,5]') return 'a ground monster\'s group strike landed on ' + JSON.stringify(struck) + ', want its foes [1,5] (never the turncoat 3)';
      if (!sc.events.some((e) => e.type === 'spell' && e.u === 11)) return 'a ground monster holding the company\'s monster never started its spell at it';
      const mend = sc.events.find((e) => e.type === 'spell' && e.u === 12);
      if (!mend || mend.t !== 10) return 'the ground mender took ' + JSON.stringify(mend && mend.t) + ', want its hurt packmate 10 (never the company\'s monster 5)';
      return null;
    });
  },

  /* A SHOOTER (a rat row with a range, through the instance's one door to its rows) at 11,2 in the east room: the company hero 1 near,
     the company's monster 5 far, the turncoat 3 farther still. */
  /* A HEALER'S CASTS: 2 a company healer, 1 the company tank, 3 a turncoat beside the healer at 10% HP. A party heal waits while only the
     turncoat is hurt; an ally heal takes the hurt tank, never the more-hurt turncoat. */
  'heals-know-sides': (M) => {
    const pick = (spell, tankHp) => {
      const units = [H(M, 1, 12, 3, 'tank', { hp: tankHp }), H(M, 2, 11, 3, 'healer', { mana: 500, maxMana: 500 }),
        placed(H(M, 3, 11, 4, 'melee_dps', { hp: 50 }), GROUND)];
      const inst = fightOf(M, units);
      inst.heroes = { 2: { hs: supplySession(M, { runes: true }), actionSet: 'hunt', range: 3, slots: M.conditions.heroSlots([spell], null) } };
      const got = M.abilities.firstUsable(inst, units[1], recorder(M, 3));
      return got && got.row.id === spell ? got.target.id : null;
    };
    const party = pick('circle_of_renewal', 500);
    if (party !== null) return 'a party heal was cast with only the turncoat hurt (on ' + party + ')';
    if (pick('circle_of_renewal', 300) !== 2) return 'a party heal did not fire for its hurt tank';
    const ally = pick('greater_mend', 300);
    return ally === 1 ? null : 'an ally heal took ' + ally + ', want the hurt tank (1), never the more-hurt turncoat (3)';
  },

  'a-shooter-aims-at-foes': (M) => {
    const inst = fightOf(M, [
      H(M, 1, 12, 3, 'tank'),
      placed(H(M, 3, 18, 1, 'melee_dps'), GROUND),
      placed(mon(M, 5, 0, 17, 5, { kind: 'slime' }), COMPANY),
      mon(M, 7, 0, 11, 2, { kind: 't_seam_shooter', target: 1 }),
    ]);
    inst.monsters = Object.assign({}, M.MONSTERS, { t_seam_shooter: Object.assign({}, M.MONSTERS.rat, { range: 4 }) });
    const m = inst.world.units[3];
    if (!M.shooters.rangeOf(inst, m)) return 'the fixture shooter does not shoot';
    const aim = M.shooters.aimOf(inst, m, null);
    return aim === 5 ? null : 'the shooter aimed at ' + aim + ', want the farthest foe in its area (5), never the farther turncoat (3)';
  },
};

const T = 'src/core/hunt/targeting.js';
const D = 'src/core/hunt/damage.js';
const A = 'src/core/hunt/abilities.js';
const C = 'src/core/hunt/conditions.js';
const MS = 'src/core/hunt/monster-spells.js';
const UI = 'src/core/hunt/unit-index.js';
const mutants = [
  { name: 'a raw kind read comes back (Follow reads the kind field)', case: 'no-raw-kind-reads',
    edits: [[T, '  return on && on.alive && isEnemy(u, on) ? on.id : inst.world.leaderLast;', "  return on && on.alive && on.side === 'mon' ? on.id : inst.world.leaderLast;"]] },
  { name: 'a hero fights the monsters, whatever their side (targeting.js engaged)', case: 'a-turncoat-is-fought',
    edits: [[T, 'export const engaged = (inst, u) => engagedFoesOf(inst, sideOf(u));', 'export const engaged = (inst, u) => engagedMonstersOf(inst);']] },
  { name: 'the swing index groups the placed units by kind (unit-index.js)', case: 'a-turncoat-is-fought',
    edits: [[UI, '    const s = sideOf(u);\n    let g = ix.sides.get(s);', '    const s = isHero(u) ? SIDE.company : SIDE.ground;\n    let g = ix.sides.get(s);']] },
  { name: 'a follow-through lands only off a monster target (damage.js)', case: 'a-turncoat-is-fought',
    edits: [[D, '  if (!(u.followPm > 0) || !isHero(u) || !isEnemy(u, t)) return;', '  if (!(u.followPm > 0) || !isHero(u) || !isMonster(t)) return;']] },
  { name: 'a follow-through takes the monsters beside its target (damage.js)', case: 'a-turncoat-is-fought',
    edits: [[D, '  for (const m of engaged(inst, u)) if (m !== t', '  for (const m of inst.world.units.filter((x) => isMonster(x) && x.alive && Number.isInteger(x.target))) if (m !== t']] },
  { name: 'an area aim counts the monsters (conditions.js engagedFoes)', case: 'the-bar-reads-sides',
    edits: [[C, 'const engagedFoes = (inst, u) => engagedFoesOf(inst, sideOf(u));', 'const engagedFoes = (inst, u) => inst.world.units.filter((m) => isMonster(m) && m.alive && Number.isInteger(m.target));']] },
  { name: 'the party is the heroes (conditions.js alliesOf)', case: 'the-bar-reads-sides',
    edits: [[C, 'const alliesOf = (inst, u) => alliesByIdOf(inst, sideOf(u));', 'const alliesOf = (inst, u) => inst.world.units.filter((a) => isHero(a) && a.alive).sort((a, b) => a.id - b.id);']] },
  { name: 'Follow follows only onto a monster (targeting.js followed)', case: 'the-bar-reads-sides',
    edits: [[T, '  return on && on.alive && isEnemy(u, on) ? on.id : inst.world.leaderLast;', '  return on && on.alive && isMonster(on) ? on.id : inst.world.leaderLast;']] },
  { name: 'ALONE counts every hero (abilities.js aloneIn)', case: 'the-bar-reads-sides',
    edits: [[A, '!world.units.some((o) => o !== hero && isAlly(hero, o) && o.alive === true);', '!world.units.some((o) => o !== hero && isHero(o) && o.alive === true);']] },
  { name: 'a heal takes every living hero (abilities.js allies)', case: 'heals-know-sides',
    edits: [[A, 'const allies = (inst, u) => livingOf(inst, sideOf(u));', 'const allies = (inst, u) => inst.world.units.filter((a) => isHero(a) && a.alive);']] },
  { name: 'a kill pays every living hero (xp-share.js)', case: 'kill-pays-its-winners',
    edits: [['src/core/hunt/xp-share.js', ' && u.alive === true && (!dead || isEnemy(dead, u)));', ' && u.alive === true);']] },
  { name: 'a strike lands on the heroes (monster-spells.js land)', case: 'spells-know-sides',
    edits: [[MS, 'inst.world.units.filter((h) => isEnemy(u, h) && h.alive && covers(s, h.x, h.y))', "inst.world.units.filter((h) => h.side === 'hero' && h.alive && covers(s, h.x, h.y))"]] },
  { name: 'a spell starts only at a hero (monster-spells.js castTarget)', case: 'spells-know-sides',
    edits: [[MS, '  if (!t || !t.alive || !isEnemy(u, t)) return null;', "  if (!t || !t.alive || t.side !== 'hero') return null;"]] },
  { name: 'a mend takes any monster of its pocket (monster-spells.js mendable)', case: 'spells-know-sides',
    edits: [[MS, '    if (m === u || !isAlly(u, m) || !m.alive', "    if (m === u || m.side !== 'mon' || !m.alive"]] },
  { name: 'a shooter aims at the heroes (shooters.js aimOf)', case: 'a-shooter-aims-at-foes',
    edits: [['src/core/hunt/shooters.js', '    if (!isEnemy(m, h) || !h.alive || !inArea(', "    if (h.side !== 'hero' || !h.alive || !inArea("]] },
];

/* The cases on the tree, then every mutant on a planted copy: each mutant's case MUST go red by its own words (a throw is HARNESS). */
const R = makeReport('hunt-core/side-seam');
const M0 = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(M0); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of process.argv.includes('--no-mutate') ? [] : mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits);
  try {
    let why = null;
    try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    if (process.env.H2_WHY) console.log('  mutant "' + mu.name + '" -> ' + why);
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + (process.argv.includes('--no-mutate') ? 'no mutant run' : mutants.length + ' mutants caught'));
R.finish();
