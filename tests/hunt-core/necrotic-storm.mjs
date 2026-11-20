// tests/hunt-core/necrotic-storm.mjs — NECROTIC AND STORM, PHASE 6B (src/data/necrotic-storm.js; itemization plan Appendix B, §11 row 6b).
// Run by run-all.mjs.
//
// The sample ships DARK (NECROTIC_STORM.live false), so every case but `dark` plays a planted copy with the switch on: the rows as
// written, through the engine's own hooks and the settle the world tick runs.
//
// dark            the repo as shipped holds none of it: the element list is fire, ice and poison, no fixed element rule, no Withered
//                 status, Storm hidden and Bone absent (no rune, recipe or store row), none of the four spells, and no monster's sealed
//                 profile names either element (nothing a generated catalogue or a screen reads moves while the switch is off)
// sample-rows     with the switch on every table validates; the four spells sit where B3 puts them (the sword ALONE's pair, never the
//                 tank's; the wand's pair), on Storm and Bone runes of five tiers with store rows, unlocking at 25 and 40, on no default
//                 bar; the class layer gives undead, the living and the slimes their B1 values
// withered-cuts   THE HEAL CUT (heal-cut.js) on every way HP comes back: the formula (30% on a hero, half on a monster, a 40% guard
//                 leaving 18%); food's instant half; a spell's heal; a spell's leech; the wraps' own heal (never regeneration); a
//                 monster's mend on a Withered packmate
// element-rules   THE FIXED RULES (elements.js ELEMENT_ON_HERO, damage.js landHit): a necrotic blow that took a hero's HP Withers it,
//                 a storm blow burns half the HP it took from the hero's mana (never below 0, on the dmg event's `burn`); a blow a shield
//                 swallowed whole, a blow at a monster and a fire blow do neither; a guard lowers the damage, the burn and the cut alike
// returns         A CAST'S RETURNS (abilities.js leechPm, manaPerHit, manaPerKill): Reave heals 30% of the HP it took; Brand's kill gives
//                 4 mana; Updraft 3 a monster hit, never more than the cast cost; the cast event carries the mana KEPT (Magic XP is
//                 paid on it) and comes before the blows it caused
// both-paths      a lone sword with Brand and Reave, a lone Mage with Updraft and Blight, and a four with both, at the Warrens: a
//                 watched hunt (10 s settles) and a closed browser (10 min) land every blow, heal, mana and coin alike; each new
//                 spell casts; Blight Withers what it hits
//
// mutant-anchors: src/data/abilities.js src/data/elements.js src/data/statuses.js src/data/runes.js src/data/monster-classes.js src/core/hunt/abilities.js src/core/hunt/damage.js src/core/hunt/status.js src/core/hunt/consumables.js src/core/hunt/pull-cycle.js src/core/hunt/monster-spells.js src/core/hunt/heal-cut.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeReport, ROOT, plant, loadCore, mon } from './fixtures/h1.js';
import { oneHero, supplySession, rngOf, loadData } from './fixtures/h4.js';
import { H, E, inst2, sc2, world as world2, PARTY_GROUND } from './fixtures/h2.js';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

const LIVE = ['src/data/necrotic-storm.js', 'live: false,', 'live: true,'];
const TREES = [...PLAY_TREES, 'tests/hunt-core/fixtures'];
const SAMPLE = Object.freeze(['brand', 'reave', 'updraft', 'blight']);
const HOUR = 3600000, WARRENS = 'coppercap_warrens', L = 42;
const sorted = (x) => (Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);
const of = (sc, type) => sc.events.filter((e) => e.type === type);
const slot = (id, o) => ({ action: Object.assign({ type: 'ability', id }, o || {}), conditions: [], join: 'and' });

/* THE ENGINE AND ITS DATA, from `root` (the planted copy, or the repo for `dark`). */
async function load(root) {
  const V = sourceQuery(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  const M = await loadCore(root);
  Object.assign(M, await loadData(M));
  Object.assign(M, { EL: await imp('src/data/elements.js'), MC: await imp('src/data/monster-classes.js'), RS: await imp('src/data/rule-subjects.js'),
    NS: await imp('src/data/necrotic-storm.js'), cut: await imp('src/core/hunt/heal-cut.js'), MS: await imp('src/data/monster-spells.js'),
    spells: await imp('src/core/hunt/monster-spells.js'), xpshare: await imp('src/core/hunt/xp-share.js'), root });
  return M;
}

/* A Withered unit: the status landed through the engine's own applyStatus (a fresh sub-step, so no event leaks into the case's). */
const wither = (M, inst, u) => M.status.applyStatus(inst, u, M.ST.STATUSES.withered, { u: null }, { atMs: 0, emit: () => {} });

const cases = {
  dark: (X) => {
    const S = X.shipped, leaks = [];
    if (S.NS.NECROTIC_STORM.live !== false) leaks.push('the switch is on');
    if (S.EL.ELEMENTS.join() !== 'ember,frost,poison') leaks.push('ELEMENTS ' + S.EL.ELEMENTS.join());
    if (Object.keys(S.EL.ELEMENT_ON_HERO).length) leaks.push('ELEMENT_ON_HERO');
    if (S.ST.STATUSES.withered) leaks.push('STATUSES.withered');
    if (!S.runes.RUNE_FAMILIES.storm || S.runes.RUNE_FAMILIES.storm.hidden !== true) leaks.push('the Storm family is not hidden');
    if (S.runes.RUNE_FAMILIES.bone || S.runes.RUNE_FAMILIES.air) leaks.push('RUNE_FAMILIES ' + Object.keys(S.runes.RUNE_FAMILIES).join());
    for (const id of Object.keys(S.ITEMS)) if (/_(storm|bone|air)_rune$/.test(id)) leaks.push('ITEMS.' + id);
    for (const b of S.SB.BASIC_SUPPLIES) if (/_(storm|bone|air)_rune$/.test(b.id)) leaks.push('store ' + b.id);
    for (const id of SAMPLE) if (S.AD.ABILITIES[id]) leaks.push('ABILITIES.' + id);
    for (const [id, m] of Object.entries(S.MONSTERS)) if (m && m.elements && ('necrotic' in m.elements || 'storm' in m.elements)) leaks.push('MONSTERS.' + id);
    return leaks.length ? 'the dark sample shows in the shipped tables: ' + leaks.join(', ') : null;
  },
  'sample-rows': (X) => {
    const M = X.M;
    const bad = M.AD.validate().concat(M.ST.validate(), M.EL.validate(), M.runes.validate(M.ITEMS), M.MC.auditRoster(M.MONSTERS));
    if (bad.length) return 'with the switch on the tables refuse it: ' + bad.slice(0, 6).join('; ');
    if (M.EL.ELEMENTS.join() !== 'ember,frost,poison,necrotic,storm') return 'ELEMENTS ' + M.EL.ELEMENTS.join();
    const wr = M.ST.STATUSES[(M.EL.ELEMENT_ON_HERO.necrotic || {}).withers];
    if (!wr || !wr.healCutPm || wr.healCutPm.hero !== 300 || wr.healCutPm.monster !== 500 || wr.durationMs !== 6000 || wr.maxStacks !== 1 || wr.guard !== 'necrotic') return 'a necrotic hit does not Wither as B1 says: ' + JSON.stringify(wr);
    if ((M.EL.ELEMENT_ON_HERO.storm || {}).manaBurnPm !== 500) return 'a storm hit does not burn half its damage in mana';
    const want = { brand: [['sword'], 25, 'storm', 'chalked_storm_rune'], reave: [['sword'], 40, 'necrotic', 'chalked_bone_rune'],
      updraft: [['destruction'], 25, 'storm', 'chalked_storm_rune'], blight: [['destruction'], 40, 'necrotic', 'chalked_bone_rune'] };
    for (const [id, [d, unlock, el, rune]] of Object.entries(want)) {
      const r = M.AD.ABILITIES[id];
      if (!r || r.disciplines.join() !== d.join() || r.unlock !== unlock || r.element !== el || r.rune !== rune) return id + ' is not ' + JSON.stringify([d, unlock, el, rune]) + ': ' + JSON.stringify(r && [r.disciplines, r.unlock, r.element, r.rune]);
    }
    if (M.AD.disciplineAbilities('shield').some((id) => SAMPLE.includes(id))) return 'the tank\'s list takes a sample spell (tank spells never make a lone tank kill faster)';
    if (M.AD.ABILITIES.reave.leechPm !== 300 || M.AD.ABILITIES.brand.manaPerKill !== 4 || M.AD.ABILITIES.updraft.manaPerHit !== 3 || M.AD.ABILITIES.blight.status !== 'withered') return 'a spell lost what it returns or lands';
    for (const f of ['storm', 'bone']) {
      if (!M.SC.CRAFTED_RUNE_FAMILIES.includes(f)) return f + ' runes are not crafted';
      for (let t = 1; t <= 5; t++) {
        const id = M.runes.runeId(f, t);
        if (!M.ITEMS[id] || M.runes.runeTierOf(M.ITEMS[id]) !== t || !M.SB.BASIC_SUPPLIES.some((b) => b.partner === id)) return id + ' has no row or no store row';
      }
    }
    if (M.ITEMS.chalked_storm_rune.n !== 'Chalked Storm Rune' || M.ITEMS.graven_bone_rune.n !== 'Graven Bone Rune') return 'a rune is not called what its id says';
    for (const [role, rows] of Object.entries(M.RS.ROLE_RULES)) for (const s of rows) if (SAMPLE.includes(s.action && s.action.id)) return 'a default bar (' + role + ') names ' + s.action.id;
    const p = (id) => JSON.stringify(M.MONSTERS[id].elements);
    if (M.MONSTERS.skeleton.elements.necrotic !== 25 || M.MONSTERS.rat.elements.necrotic !== -15) return 'the class layer: skeleton ' + p('skeleton') + ', rat ' + p('rat');
    if (M.MONSTERS.slime.elements.necrotic !== 50 || M.MONSTERS.slime.elements.storm !== 50) return 'a slime does not halve the new two: ' + p('slime');
    return null;
  },
  'withered-cuts': (X) => {
    const M = X.M;
    /* THE FORMULA: a hero 30% (82 of 100 at a 40% guard), a monster half, a 1-point heal still 1; nothing unwithered */
    const a = oneHero(M, { hp: 10, maxHp: 1000 });
    if (M.cut.healTaken(a.h, 100) !== 100) return 'an unwithered hero lost healing';
    wither(M, a.inst, a.h);
    if (M.cut.healTaken(a.h, 100) !== 70 || M.cut.healTaken(a.h, 1) !== 1) return 'a Withered hero takes ' + M.cut.healTaken(a.h, 100) + ' of 100 (want 70) and ' + M.cut.healTaken(a.h, 1) + ' of 1';
    const g = oneHero(M, { hp: 10, maxHp: 1000 });
    g.h.resistPm = { necrotic: 400 };
    wither(M, g.inst, g.h);
    if (M.cut.healTaken(g.h, 100) !== 82) return 'a hero with a 40% necrotic guard takes ' + M.cut.healTaken(g.h, 100) + ' of 100, want 82 (an 18% cut)';
    const m = mon(M, 20, 0, 14, 3, { hp: 1, maxHp: 1000 });
    wither(M, a.inst, m);
    if (M.cut.healTaken(m, 100) !== 50) return 'a Withered monster takes ' + M.cut.healTaken(m, 100) + ' of 100, want 50';
    /* FOOD: the instant half of a 60-point store food, Withered and not (the `eat` event's `landed`) */
    const eat = (withered) => {
      const hs = supplySession(M);
      hs.basics = Object.assign({}, hs.basics, { salted_shrimp: Object.assign({}, hs.basics.salted_shrimp, { heals: 60 }) });
      const x = oneHero(M, { hp: 10, maxHp: 1000 }, { hs, bar: [{ action: { type: 'consume', id: 'salted_shrimp' }, conditions: [], join: 'and' }] });
      if (withered) wither(M, x.inst, x.h);
      M.consumables.consume(x.inst, x.sc);
      const e = of(x.sc, 'eat')[0];
      return e ? e.landed : -1;
    };
    const ate = eat(false), ateW = eat(true);
    if (!(ate > 10) || ateW !== ate - Math.floor((ate * 300) / 1000)) return 'food: ' + ate + ' whole, ' + ateW + ' Withered (want ' + (ate - Math.floor((ate * 300) / 1000)) + ')';
    /* A SPELL'S HEAL: Mend on the same dice, Withered and not */
    const mend = (withered) => {
      const x = oneHero(M, { hp: 10, maxHp: 1000 }, { bar: ['mend'] });
      x.sc.rng = rngOf(M, 5);
      if (withered) wither(M, x.inst, x.h);
      M.abilities.castAbilities(x.inst, x.sc);
      const e = of(x.sc, 'heal')[0];
      return e ? e.amount : -1;
    };
    const healed = mend(false), healedW = mend(true);
    if (!(healed > 10) || healedW !== healed - Math.floor((healed * 300) / 1000)) return 'Mend: ' + healed + ' whole, ' + healedW + ' Withered';
    /* A SPELL'S LEECH: Reave's 30% back, then cut on a Withered caster (Melee 60, its own Etched Bone Runes) */
    const reave = (withered) => {
      const x = oneHero(M, { hp: 10, maxHp: 1000 }, { bar: [slot('reave')], skills: { melee: M.XP.skillXpForLevel('melee', 60) },
        hs: supplySession(M, { bag: { etched_bone_rune: { loaded: 10 } } }) }, [{ x: 13, y: 3, hp: 5000, maxHp: 5000 }]);
      x.sc.rng = rngOf(M, 9);
      if (withered) wither(M, x.inst, x.h);
      M.abilities.castAbilities(x.inst, x.sc);
      const d = of(x.sc, 'dmg').find((e) => e.ability === 'reave'), h = of(x.sc, 'heal').find((e) => e.ability === 'reave');
      return [d ? d.amount : -1, h ? h.amount : 0];
    };
    const [took, back] = reave(false), [tookW, backW] = reave(true);
    const lee = Math.floor((took * 300) / 1000);
    if (!(took > 20) || back !== lee) return 'Reave took ' + took + ' and healed ' + back + ', want ' + lee;
    if (tookW !== took || backW !== lee - Math.floor((lee * 300) / 1000)) return 'Reave on a Withered caster healed ' + backW + ', want ' + (lee - Math.floor((lee * 300) / 1000));
    /* THE WRAPS' OWN HEAL (pull-cycle.js tickHeroes): one second at 8 permille/s, Withered and not; regeneration alone is never cut */
    const second = (own, withered) => {
      const h = H(M, 1, 2, 8, 'tank', { hp: 1000, maxHp: 2000 });
      if (own) h.selfHealPm = own;
      const packs = PARTY_GROUND().pockets.map((_, i) => ({ alive: i === 0, aggro: i === 0, holder: i === 0 ? 1 : null, respawnAtMs: 1e9 }));
      const inst = inst2(M, world2(M, [h, E(M, 2, 0, 14, 3, 1)], { phase: 'fight', leader: 1, packs }), PARTY_GROUND());
      if (withered) wither(M, inst, h);
      for (let i = 0; i < 10; i++) M.hunt['pull-cycle'].runPhase(inst, sc2(M, 1));
      return h.hp - 1000;
    };
    const fight = M.coreModel.VITALS.inFightRegenPermillePerS;
    const want = (own) => Math.floor((10 * Math.floor((2000 * (fight * 1000 + own) * 100) / 1000000)) / 1000);
    if (second(8, false) !== want(8000) || second(8, true) !== want(8000 - Math.floor((8000 * 300) / 1000))) return 'the own heal: ' + second(8, false) + ' whole, ' + second(8, true) + ' Withered, want ' + want(8000) + ' and ' + want(5600);
    if (second(0, true) !== second(0, false)) return 'regeneration was cut on a Withered hero: ' + second(0, true) + ' against ' + second(0, false);
    /* A MONSTER'S MEND on a Withered packmate: half the same roll */
    const mended = (withered) => {
      const T = M.MS.MONSTER_SPELLS, was = M.MS.SPELL_SWITCH.live, span = M.MS.SPELL_STAGGER.spanPm, kept = M.MONSTERS.slime.spells;
      M.MS.SPELL_SWITCH.live = true; M.MS.SPELL_STAGGER.spanPm = 0;
      T.t_mend = { n: 'Test Mend', shape: 'mend', range: 3, windupMs: 1200, cdMs: 6000, hitPm: 4000, element: null };
      M.MONSTERS.slime.spells = ['t_mend'];
      try {
        const k = H(M, 1, 13, 3, 'tank');
        const c = E(M, 10, 0, 14, 3, 1, { kind: 'slime', hp: 20, maxHp: 20 });
        const b = E(M, 12, 0, 15, 4, 1, { hp: 1, maxHp: 1000 });
        const inst = inst2(M, world2(M, [k, c, b], { phase: 'fight', leader: 1, packs: [{ aggro: true, holder: 1 }, { aggro: false, holder: null }, { aggro: false, holder: null }] }));
        if (withered) wither(M, inst, b);
        const t = sc2(M, 6);
        for (let i = 0; i <= 13; i++) { t.atMs = i * 100; M.movement.occupancy(inst); M.spells.castSpells(inst, t); }
        const e = t.events.find((x) => x.type === 'heal' && x.t === 12);
        return e ? e.amount : -1;
      } finally { M.MS.SPELL_SWITCH.live = was; M.MS.SPELL_STAGGER.spanPm = span; delete T.t_mend; if (kept === undefined) delete M.MONSTERS.slime.spells; else M.MONSTERS.slime.spells = kept; }
    };
    const mendPlain = mended(false), mendW = mended(true);
    if (!(mendPlain > 2) || mendW !== mendPlain - Math.floor((mendPlain * 500) / 1000)) return 'a mend: ' + mendPlain + ' whole, ' + mendW + ' on a Withered packmate (want half)';
    return null;
  },
  'element-rules': (X) => {
    const M = X.M;
    const blow = (element, o) => {
      const x = oneHero(M, Object.assign({ hp: 500, maxHp: 500, mana: 40, maxMana: 100 }, o && o.hero), {}, [{ x: 13, y: 3, hp: 50, maxHp: 50 }]);
      x.sc.rng = rngOf(M, 2);
      if (o && o.resistPm) x.h.resistPm = o.resistPm;
      if (o && o.shield) { x.h.shield = o.shield; x.h.shieldBy = 1; }
      const src = x.w.units.find((u) => u.side === 'mon');
      const atMon = o && o.atMonster;
      const r = M.damage.landHit(x.inst, x.sc, atMon ? x.h : src, atMon ? src : x.h, 20, element, { id: 't_blow' }, false);
      const d = of(x.sc, 'dmg')[0];
      const tgt = atMon ? src : x.h;
      return { r, burn: d && d.burn, mana: x.h.mana, withered: (tgt.statuses || []).filter((s) => s.s === 'withered'), on: of(x.sc, 'status_on').length };
    };
    const n = blow('necrotic');
    if (n.r.dmg !== 20 || n.withered.length !== 1 || n.withered[0].scale !== 1000 || n.on !== 1 || n.mana !== 40) return 'a necrotic blow of 20: ' + JSON.stringify(n);
    const s = blow('storm');
    if (s.r.dmg !== 20 || s.burn !== 10 || s.mana !== 30 || s.withered.length) return 'a storm blow of 20 burns 10 mana: ' + JSON.stringify(s);
    const dry = blow('storm', { hero: { mana: 3 } });
    if (dry.burn !== 3 || dry.mana !== 0) return 'a storm blow burned past the mana held: ' + JSON.stringify(dry);
    const shelled = blow('necrotic', { shield: 100 });
    if (shelled.r.dmg !== 0 || shelled.withered.length) return 'a necrotic blow a shield swallowed whole Withered the hero: ' + JSON.stringify(shelled);
    const sShell = blow('storm', { shield: 100 });
    if (sShell.burn || sShell.mana !== 40) return 'a storm blow a shield swallowed burned mana: ' + JSON.stringify(sShell);
    const atMon = blow('necrotic', { atMonster: true });
    if (atMon.withered.length) return 'a necrotic blow Withered a monster (a hero\'s spell does that through its status, never its element)';
    const fire = blow('ember');
    if (fire.burn || fire.withered.length || fire.mana !== 40) return 'a fire blow brought a rule: ' + JSON.stringify(fire);
    /* A GUARD lowers the damage, the burn and the cut by the same percent (40%: 12 of 20, 6 burned, the cut at 600) */
    const gn = blow('necrotic', { resistPm: { necrotic: 400 } }), gs = blow('storm', { resistPm: { storm: 400 } });
    if (gn.r.dmg !== 12 || gn.withered.length !== 1 || gn.withered[0].scale !== 600) return 'a 40% necrotic guard: ' + JSON.stringify(gn);
    if (gs.r.dmg !== 12 || gs.burn !== 6) return 'a 40% storm guard: ' + JSON.stringify(gs);
    return null;
  },
  returns: (X) => {
    const M = X.M;
    const cast = (id, o) => {
      const mons = o.mons || [{ x: 13, y: 3, hp: 5000, maxHp: 5000 }];
      const x = oneHero(M, { hp: 500, maxHp: 500, mana: o.mana ?? 50, maxMana: 100 }, { bar: [slot(id, { store: o.store })], range: o.range || 1,
        hs: supplySession(M, { runes: true }) }, mons);
      x.sc.rng = rngOf(M, 4);
      if (o.focusPm) x.h.focusPm = o.focusPm;
      M.abilities.castAbilities(x.inst, x.sc);
      const c = of(x.sc, 'cast')[0];
      const at = (type) => x.sc.events.findIndex((e) => e.type === type);
      return { c, mana: x.h.mana, castAt: at('cast'), dmgAt: at('dmg'), hits: of(x.sc, 'dmg').filter((e) => e.ability === id).length, kills: of(x.sc, 'kill').length };
    };
    /* BRAND: a kill gives 4 back, the cast keeps 6 (10 at version I), Magic XP paid on the 6; no kill, nothing back */
    const b = cast('brand', { store: 'plain_storm_rune', mons: [{ x: 13, y: 3, hp: 1, maxHp: 1 }] });
    if (!b.c || b.kills !== 1 || b.c.back !== 4 || b.c.mana !== 6 || b.mana !== 44) return 'Brand\'s kill: ' + JSON.stringify(b);
    if (!(b.castAt >= 0 && b.castAt < b.dmgAt)) return 'the cast event follows the blow it caused: cast at ' + b.castAt + ', dmg at ' + b.dmgAt;
    const bx = M.xpshare.magicXpFor(b.c.mana, b.c.magicXpMult / 1000), gross = M.xpshare.magicXpFor(10, b.c.magicXpMult / 1000);
    if (!(bx < gross)) return 'Brand\'s Magic XP is paid on the mana it gave back too: ' + bx + ' of ' + gross;
    const b0 = cast('brand', { store: 'plain_storm_rune' });
    if (!b0.c || b0.c.back !== undefined || b0.c.mana !== 10 || b0.mana !== 40) return 'Brand with no kill: ' + JSON.stringify(b0);
    /* UPDRAFT: 3 a monster hit; nine under it give 27, never more than the 22 it cost */
    const two = cast('updraft', { store: 'plain_storm_rune', range: 6, mons: [{ x: 14, y: 3, hp: 5000, maxHp: 5000 }, { x: 15, y: 3, hp: 5000, maxHp: 5000 }] });
    if (!two.c || two.hits !== 2 || two.c.back !== 6 || two.c.mana !== 16 || two.mana !== 34) return 'Updraft on two: ' + JSON.stringify(two);
    const nine = [];
    for (let x = 13; x <= 15; x++) for (let y = 2; y <= 4; y++) nine.push({ x, y, hp: 5000, maxHp: 5000 });
    const capped = cast('updraft', { store: 'plain_storm_rune', range: 6, mons: nine });
    if (!capped.c || capped.hits !== 9 || capped.c.back !== 22 || capped.c.mana !== 0 || capped.mana !== 50) return 'Updraft on nine gave back more than it cost: ' + JSON.stringify(capped);
    /* NEVER PAST MAX MANA: a full caster takes back only the room the cast made, and none where its kill already filled the pool
       (the Focus perk, jewelry.js: a kill gives half the pool back first), so the cast kept all 10 */
    const full = cast('updraft', { store: 'plain_storm_rune', range: 6, mana: 100, mons: nine });
    if (!full.c || full.mana !== 100 || full.c.back !== 22) return 'Updraft from a full pool: ' + JSON.stringify(full);
    const focused = cast('brand', { store: 'plain_storm_rune', mana: 100, focusPm: 500, mons: [{ x: 13, y: 3, hp: 1, maxHp: 1 }] });
    if (!focused.c || focused.kills !== 1 || focused.mana !== 100 || focused.c.back !== undefined || focused.c.mana !== 10) return 'Brand\'s kill on a pool Focus filled: ' + JSON.stringify(focused);
    return null;
  },
  'both-paths': (X) => {
    const P = X.P, M = X.M;
    const own = { etched_storm_rune: { loaded: 2000 }, etched_bone_rune: { loaded: 2000 } };
    const swordBar = [slot('reave'), slot('brand'), slot('power_strike'), { ...slot('mend'), conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 50 }] }];
    const mageBar = [slot('blight'), slot('updraft'), slot('frost_lance')];
    const play = (roles, windowMs) => {
      const events = [];
      const r = P.run(WARRENS, L, roles, { spanMs: HOUR / 4, windowMs, xpFrac: true,
        equipment: (role, seat) => (role === 'melee_dps' ? { ...P.kitFor(L, role), weapon: 'steel_sword' } : P.kitFor(L, role)),
        bag: (role) => (role === 'ranger' ? { bronze_arrows: { loaded: 1 } } : { ...own }),
        bar: (role) => P.refBar(WARRENS).concat(JSON.parse(JSON.stringify(role === 'melee_dps' ? swordBar : role === 'mage' ? mageBar : []))),
        onWindow: (out) => { for (const e of out.events || []) events.push(e); } });
      return { r, events, whole: JSON.stringify(sorted([r.totals, r.members, r.items, r.heroXp])) + JSON.stringify(events) };
    };
    for (const roles of [['melee_dps'], ['mage'], ['tank', 'healer', 'mage', 'melee_dps']]) {
      const viewed = play(roles, 10000), closed = play(roles, 600000);
      if (viewed.whole !== closed.whole) return roles.join('+') + ': a watched hunt and a closed browser disagree';
      const casts = (id) => closed.events.filter((e) => e.type === 'cast' && e.ability === id).length;
      const mine = roles.includes('melee_dps') ? ['brand', 'reave'] : [];
      if (roles.includes('mage')) mine.push('updraft', 'blight');
      if (process.argv.includes('--verbose')) console.log('  ' + roles.join('+') + ': kills ' + closed.r.totals.kills + ', casts ' + mine.map((id) => id + ' ' + casts(id)).join(', '));
      for (const id of mine) if (casts(id) < 5) return roles.join('+') + ': ' + id + ' cast ' + casts(id) + ' times in a quarter hour';
      if (roles.includes('mage') && !closed.events.some((e) => e.type === 'status_on' && e.status === 'withered')) return roles.join('+') + ': Blight Withered nothing';
      if (roles.includes('melee_dps') && !closed.events.some((e) => e.type === 'heal' && e.ability === 'reave')) return roles.join('+') + ': Reave drained nothing';
      if (!closed.events.some((e) => e.type === 'cast' && e.back > 0)) return roles.join('+') + ': no storm spell gave mana back';
    }
    return M ? null : 'no engine';
  },
};

const mutants = [
  { name: 'the sample leaks into the shipped ability table', case: 'dark', shipped: true,
    edits: [['src/data/abilities.js', '  ...(NECROTIC_STORM.live ? [\n    ab({ id: \'brand\'', '  ...(true ? [\n    ab({ id: \'brand\'']] },
  { name: 'the new elements join the shipped list', case: 'dark', shipped: true,
    edits: [['src/data/elements.js', "...(NECROTIC_STORM.live ? ['necrotic', 'storm'] : [])", "'necrotic', 'storm'"]] },
  { name: 'the class layer runs with the switch off', case: 'dark', shipped: true,
    edits: [['src/data/monster-classes.js', '  if (!NECROTIC_STORM.live) return profile;\n', ''], ['src/data/monster-classes.js', 'const NEW_ELEMENT_CLASSES = Object.freeze(NECROTIC_STORM.live ? {', 'const NEW_ELEMENT_CLASSES = Object.freeze(true ? {']] },
  { name: 'the sword\'s pair joins the tank\'s list', case: 'sample-rows',
    edits: [['src/data/abilities.js', "ab({ id: 'brand', n: 'Brand', disciplines: ['sword'],", "ab({ id: 'brand', n: 'Brand', disciplines: ['shield', 'sword'],"]] },
  { name: 'a slime stops halving the new two', case: 'sample-rows',
    edits: [['src/data/monster-classes.js', '  const halves = FIRST_ELEMENTS.every((e) => profile[e] === HALF_OF_EVERY);', '  const halves = false;']] },
  { name: 'food heals a Withered hero whole', case: 'withered-cuts',
    edits: [['src/core/hunt/consumables.js', "  if (stat === 'hp') n = healTaken(u, n);\n", '']] },
  { name: 'a spell heals a Withered target whole', case: 'withered-cuts',
    edits: [['src/core/hunt/abilities.js', '  n = healTaken(t, n);\n', '']] },
  { name: 'the leech is never cut', case: 'withered-cuts',
    edits: [['src/core/hunt/abilities.js', 'Math.min(healTaken(u, Math.floor((took * row.leechPm) / 1000)), int(u.maxHp)', 'Math.min(Math.floor((took * row.leechPm) / 1000), int(u.maxHp)']] },
  { name: 'the own heal is never cut', case: 'withered-cuts',
    edits: [['src/core/hunt/pull-cycle.js', '    const own = healTaken(h, worn);\n', '    const own = worn;\n']] },
  { name: 'regeneration is cut too', case: 'withered-cuts',
    edits: [['src/core/hunt/pull-cycle.js', '(h.maxHp * (rate * pm + own) * sc.dtMs)', '(h.maxHp * healTaken(h, rate * pm + own) * sc.dtMs)']] },
  { name: 'a monster\'s mend ignores Withered', case: 'withered-cuts',
    edits: [['src/core/hunt/monster-spells.js', 'healTaken(t, sc.rng.int(lo, top))', 'sc.rng.int(lo, top)']] },
  { name: 'the guard does not lower the cut', case: 'withered-cuts',
    edits: [['src/core/hunt/status.js', "  if (row.healCutPm) return unit && unit.side === 'hero' && row.guard ? heroElementPermille(unit.resistPm, row.guard) : 1000;\n", '  if (row.healCutPm) return 1000;\n']] },
  { name: 'a monster is cut the hero\'s 30%', case: 'withered-cuts',
    edits: [['src/core/hunt/heal-cut.js', ' : row.healCutPm.monster;', ' : row.healCutPm.hero;']] },
  { name: 'a necrotic blow never Withers', case: 'element-rules',
    edits: [['src/core/hunt/damage.js', '  if (rule && rule.withers) applyStatus(inst, target, statusRow(rule.withers), { u }, sc);\n', '']] },
  { name: 'a storm blow burns no mana', case: 'element-rules',
    edits: [['src/core/hunt/damage.js', '  if (burn > 0) target.mana = Math.floor(Number(target.mana)) - burn;\n', '']] },
  { name: 'the rules read the blow before the shield', case: 'element-rules',
    edits: [['src/core/hunt/damage.js', "const rule = target.side === 'hero' && r.dmg > 0 ? elementOnHeroOf(element) : null;", "const rule = target.side === 'hero' ? elementOnHeroOf(element) : null;"]] },
  { name: 'a necrotic blow Withers a monster too', case: 'element-rules',
    edits: [['src/core/hunt/damage.js', "const rule = target.side === 'hero' && r.dmg > 0 ? elementOnHeroOf(element) : null;", 'const rule = r.dmg > 0 ? elementOnHeroOf(element) : null;']] },
  { name: 'mana back pays Magic XP on what came back', case: 'returns',
    edits: [['src/core/hunt/abilities.js', '  const mana = spent - back;\n', '  const mana = spent;\n']] },
  { name: 'a spell gives back more than it cost', case: 'returns',
    edits: [['src/core/hunt/abilities.js', '  const want = Math.min(spent, count.hits * (row.manaPerHit || 0) + count.kills * (row.manaPerKill || 0));', '  const want = count.hits * (row.manaPerHit || 0) + count.kills * (row.manaPerKill || 0);']] },
  { name: 'the held blows go out before their cast', case: 'returns',
    edits: [['src/core/hunt/abilities.js', '    sc.emit = (ev) => { held.push(ev); };\n', '']] },
  { name: 'mana back fills past the pool', case: 'returns',
    edits: [['src/core/hunt/abilities.js', '  const got = Math.max(0, Math.min(want, int(u.maxMana) - int(u.mana)));', '  const got = Math.max(0, want);']] },
  { name: 'the leech rolls on the wall clock\'s dice, so two cuts disagree', case: 'both-paths',
    edits: [['src/core/hunt/abilities.js', 'Math.min(healTaken(u, Math.floor((took * row.leechPm) / 1000)), int(u.maxHp)', 'Math.min(healTaken(u, Math.floor((took * row.leechPm * (1 + Math.random())) / 1000)), int(u.maxHp)']] },
];

const R = makeReport('hunt-core/necrotic-storm');
async function loadAll(root, shippedRoot) {
  const V = sourceQuery(shippedRoot);
  const si = (p) => import(pathToFileURL(join(shippedRoot, p)).href + V);
  const { loadPlay } = await import(pathToFileURL(join(root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  return { M: await load(root), P: await loadPlay(root),
    shipped: { NS: await si('src/data/necrotic-storm.js'), EL: await si('src/data/elements.js'), ST: await si('src/data/statuses.js'), runes: await si('src/data/runes.js'),
      ITEMS: (await si('src/data/items.js')).ITEMS, SB: await si('src/data/supply-basics.js'), AD: await si('src/data/abilities.js'), MONSTERS: (await si('src/data/monsters.js')).MONSTERS } };
}
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const home = plant([LIVE], TREES);
try {
  const X = await loadAll(home.root, ROOT);
  for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
    let why = null;
    try { why = await fn(X); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
} finally { home.done(); }
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  /* a `shipped` mutant plants into a copy read as the repo as shipped (the switch off); every other into the live copy */
  const p = plant(mu.shipped ? mu.edits : [LIVE, ...mu.edits], TREES);
  try {
    let why = null;
    try {
      const X = await loadAll(p.root, p.root);
      why = await cases[mu.case](X);
    } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
R.finish();
