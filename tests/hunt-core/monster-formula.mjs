// tests/hunt-core/monster-formula.mjs — A MONSTER IS A STEP AND A ROLE (src/core/hunt/monster-formula.js, src/data/monster-roles.js
// MONSTER_ROLES dials and MONSTER_FORMULA; lane/monster-formula, 04-math-strategy.md section 6). Run by run-all.mjs.
//
//   derive  each role's derived stats at a gap of 0 read its dials: health is secondsToKill x killMult x the reference company's damage a
//           fighting second; the steady blow deals (1 - windupShare) x pressure of the reference health a second after the reference
//           land and armor (unless blowCap holds it, which it reports); a wind-up's mean hit is windupSize of the reference health and it
//           comes every windupSize / (windupShare x pressure) seconds; a Warder's mend puts mend.seconds of the company's damage back
//           every mend.everyS; a boss takes killMult; every derived spell row is valid (monster-spells.js validateSpell).
//   dial    on a formula ground the engine's dial puts a derived row at exactly its derived stats on the reference step for the
//           reference four, grows it by the step's ratio past it, sizes the pull to the party (heroes x encounterPerHero there) and pays
//           a kill the same coin as the switch off; off the switch the dial is what it was for every party size.
//   switch  the ground's one data switch: off, no derived row or table; on, every monster of the ground plays its derived row with its
//           content (name, drops, coin, XP) its own, and no other monster moves.
//   ramp    one ramp for every boss: a formula boss keeps its row's boss kind (src/data/bosses.js), so boss-phases.js ramps it on its
//           own fight clock as any boss; a pull monster has none, and the formula writes no second ramp.
//   armor   a hero blow on a formula monster lands net of its role's armor (monsterArmorPm); a hand row keeps its flat defense only.
//   data    every role carries its dials inside their bands, a wind-up shape exactly when it has a wind-up share; every scale ground names
//           its reference Level and its switch; on every scale ground the derived spell rows land inside the spell bounds unclamped (a
//           clamped row would not deal its dial); every monster of a formula ground names a role.
//   grounds EVERY SCALE GROUND ON THE FORMULA (lane/monster-roles-ford-wings): Muster Barrows, Hask's Ford and both Catacomb wings, each
//           monster on its derived row at its derived health on the reference step, a row's own wind-up kept (id and shape) with the formula's
//           number, a row with none casting its role's, a Warder mending.
//   play    THE ONE ENGINE (CLAUDE.md section 6): Muster Barrows with its switch on, a four on Steady at its reference step through the real
//           settle: its monsters stand at their derived health over the dial, a Brute's wind-up (Heavy Blow) is cast, and the hunt is the
//           same, kill for kill, settled in one window and in 1-minute windows (viewed or closed); with the switch off no derived spell.
//   play-ford  the same on Hask's Ford, the first newly switched ground: the Bannerman (a Warder) mends, the Ledger Wight (a Caster) and the
//           Fordsunk (a Brute) wind up.
//   mutants each rule planted back, each caught by its own case.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadCore, plant, makeReport } from './fixtures/h1.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const load = async (root) => {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.mf = await imp('src/core/hunt/monster-formula.js');
  M.danger = await imp('src/core/hunt/danger.js');
  M.dangerData = await imp('src/data/danger.js');
  M.roleData = await imp('src/data/monster-roles.js');
  M.spells = await imp('src/data/monster-spells.js');
  M.bosses = await imp('src/data/bosses.js');
  M.statuses = await imp('src/data/statuses.js');
  M.tower = await imp('src/core/hunt/tower.js');
  M.towerData = await imp('src/data/tower.js');
  M.tiers = await imp('src/core/hunt/dial.js');
  M.grounds = await imp('src/data/hunt-grounds.js');
  M.combat = await imp('src/core/combat.js');
  M.vitals = (await imp('src/data/core-model.js')).VITALS;
  M.root = root;
  return M;
};

/* the switch on Muster Barrows, as a planted edit (the shipped row's own words) */
const TOWER_ON = ['src/data/tower.js', "  monsters: 'rows',", "  monsters: 'formula',"];
const MUSTER_ON = ['src/data/danger.js', "entryLevel: 55, refLevel: 60, monsters: 'rows' })", "entryLevel: 55, refLevel: 60, monsters: 'formula' })"];
/* SHIPPED ON since the tuning pass (lane/tuning-pass, 2026-11-23, 29-tuning-pass.md): the tree is the switch on, the off side is planted. A
   mutant marked `on: true` plays on the tree as it ships; every other one with the switch planted off, as before */
const MUSTER_OFF = [MUSTER_ON[0], MUSTER_ON[2], MUSTER_ON[1]];
/* EVERY SCALE GROUND ON THE FORMULA (lane/monster-roles-ford-wings, 2026-11-23): Hask's Ford and both Catacomb wings switched on once each of
   their monsters carried a role. The switch's off side (switch, dial-off) needs a scale ground on its rows, so the Ford is planted back on
   its rows there; the off view (derive, dial-off, tower, data, play-off) plants both Muster and the Ford off */
const FORD_ON = ['src/data/danger.js', "entryLevel: 45, refLevel: 52, monsters: 'rows' })", "entryLevel: 45, refLevel: 52, monsters: 'formula' })"];
const FORD_OFF = [FORD_ON[0], FORD_ON[2], FORD_ON[1]];
const OFF_VIEW = [MUSTER_OFF, FORD_OFF];
const SWITCHED = Object.freeze(['hasks_ford', 'catacomb_bone_wing', 'catacomb_flooded_wing']);
const close = (a, b, rel) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
/* a scale ground's row with its switch on (derive reads only the row) */
const onRow = (M, id) => ({ ...M.dangerData.DANGER_GROUNDS[id], monsters: 'formula' });

const CASES = {
  derive(M) {
    const { MONSTER_ROLES: ROLES, MONSTER_FORMULA: F } = M.roleData;
    const g = onRow(M, 'muster_barrows');
    /* (lane/stage3-pipeline: a ground on the scale meets its monsters in the amount pipeline, so it derives from the pipeline's own
       reference output, refCompany(level, 'steps'): health on the display curve, take = AMOUNT.pressurePm, hit = REF.hit while hitRoll holds) */
    const ref = M.mf.refCompany(g.refLevel, 'steps');
    if (!(ref.dpsFight > 0) || ref.hp !== M.vitals.hpBase + M.vitals.hpPerLevel * (g.refLevel - 1)) return 'CONTROL: the reference company reads ' + JSON.stringify(ref);
    const take = ref.takePm / 1000, swingS = M.combat.COMBAT_BALANCE.tickMs / 1000;
    let winds = 0;
    for (const [id, R] of Object.entries(ROLES)) {
      const s = M.mf.roleStats(id, g, 'pull');
      const net = 1 - Math.round(1000 * (R.armor || 0)) / 1000;
      if (!(R.armor > 0 && R.armor < 0.9)) return id + ': armor ' + R.armor + ' is not a share in (0, 0.9)';
      if (s.armorPm !== Math.round(1000 * R.armor)) return id + ': armorPm ' + s.armorPm + ', not the role armor';
      if (!close(s.hp, R.secondsToKill * F.encounters.pull.killMult * ref.dpsFight * net, 1e-9)) return id + ': health ' + s.hp + ', not secondsToKill x the company net of its armor (' + R.secondsToKill * ref.dpsFight * net + ')';
      const boss = M.mf.roleStats(id, g, 'boss');
      if (!close(boss.hp, s.hp * F.encounters.boss.killMult, 1e-9)) return id + ': a boss has ' + boss.hp + ' health, not killMult x ' + s.hp;
      const w = R.windup && R.windupShare > 0 ? R.windupShare : 0;
      const steady = (ref.hit * take * (s.top + 1)) / 2 / swingS;
      const want = (1 - w) * R.pressure * ref.hp;
      if (!close(steady, want * s.steadyShare, 1e-6)) return id + ': the steady blow deals ' + steady.toFixed(3) + ' a second, not (1 - windupShare) x pressure x the reference health (' + want.toFixed(3) + ' x ' + s.steadyShare + ')';
      const rolePm = Number.isInteger(R.maxHitPm) ? R.maxHitPm / 1000 : 1;
      if (!close(s.top, s.maxHit * rolePm, 1e-9)) return id + ': the row blow ' + s.maxHit + ' lands ' + s.top + ', not its role\'s share';
      const ids = Object.keys(s.spells);
      for (const sid of ids) { const bad = M.spells.validateSpell(s.spells[sid], sid); if (bad.length) return id + ': ' + bad.join('; '); }
      if (w > 0) {
        winds++;
        const sp = s.spells['mf_' + id];
        if (!sp) return id + ': a wind-up share of ' + w + ' and no wind-up spell';
        const mean = (0.75 * sp.hitPm * s.maxHit * take) / 1000, size = R.windupSize * F.windupScale.size;
        if (!close(mean, size * ref.hp, 0.01)) return id + ': a wind-up lands ' + mean.toFixed(1) + ' on average, not windupSize x the reference health (' + (size * ref.hp).toFixed(1) + ')';
        const every = (R.windupSize / (w * R.pressure)) * F.windupScale.every * 1000;
        if (Math.abs(sp.cdMs - Math.max(2000, every)) > 100) return id + ': a wind-up every ' + sp.cdMs + ' ms, not windupSize / (windupShare x pressure) (' + Math.round(every) + ')';
      } else if (s.spells['mf_' + id]) return id + ': no wind-up share and a wind-up spell';
      if (R.mend) {
        const sp = s.spells['mf_' + id + '_mend'];
        if (!sp || sp.shape !== 'mend') return id + ': a mend dial and no mend';
        const heal = (0.75 * sp.hitPm * s.maxHit) / 1000;
        if (!close(heal, R.mend.seconds * ref.dpsFight, 0.01)) return id + ': a mend puts back ' + heal.toFixed(1) + ', not mend.seconds of the company (' + (R.mend.seconds * ref.dpsFight).toFixed(1) + ')';
        if (sp.cdMs !== R.mend.everyS * 1000) return id + ': a mend every ' + sp.cdMs + ' ms, not mend.everyS';
      }
    }
    if (!winds) return 'CONTROL: no role has a wind-up';
    return null;
  },
  dial(M) {
    const { DANGER, PAY } = M.dangerData;
    const { MONSTER_FORMULA: F } = M.roleData;
    const ground = M.grounds.HUNT_GROUNDS.muster_barrows, g = M.dangerData.DANGER_GROUNDS.muster_barrows;
    if (g.monsters !== 'formula') return 'CONTROL: the case needs Muster Barrows switched on';
    const row = M.MONSTERS.muster_knight, d = M.mf.formulaRow(row, 'muster_barrows');
    if (!d) return 'CONTROL: no derived row for the Barrow Knight';
    const s = M.mf.roleStats(row.role, g, 'pull');
    const at = (step, heroes) => M.tiers.atTier(d, M.danger.dangerDial(ground, step, heroes));
    /* the monsters' reference step is the formula's anchor (formulaStepOf: Muster's 590, apart from the pay's refStep, its four's hold) */
    const anchor = M.danger.formulaStepOf(g), r0 = at(anchor, 4);
    if (!close(r0.hp, s.hp, 0.002)) return 'the Knight stands at ' + r0.hp + ' health on the reference step, its derivation says ' + Math.round(s.hp);
    const top0 = M.combat.monsterMaxHit(r0);
    if (!close(top0, s.maxHit, 0.01)) return 'the Knight\'s biggest blow on the reference step is ' + top0 + ', its derivation says ' + s.maxHit.toFixed(1);
    const r20 = at(anchor + 20, 4);
    if (!close(r20.hp / r0.hp, Math.pow(1 + DANGER.powerStep, 20), 0.003)) return 'twenty steps deeper the Knight has x' + (r20.hp / r0.hp).toFixed(4) + ' health, not the step\'s ratio';
    for (const h of [1, 2, 3, 4]) {
      const dz = M.danger.dangerDial(ground, anchor, h);
      const want = Math.max(1, Math.min(DANGER.pullMax, Math.round(h * F.encounterPerHero)));
      if (dz.pull[0] !== want) return h + ' heroes meet a pull of ' + dz.pull[0] + ' on the reference step, not heroes x encounterPerHero (' + want + ')';
      const each = M.tiers.atTier(d, dz).hp;
      if (!close(each, s.hp, 0.02)) return h + ' heroes meet a Knight of ' + each + ' health, not the reference ' + Math.round(s.hp);
      for (const step of [0, g.floorStep, g.refStep, g.topStep]) {
        if (M.danger.dangerDial(ground, step, h).coinPm !== M.danger.dangerDial(ground, step, 4).coinPm) return 'a kill pays coin by the party\'s size at step ' + step;
      }
    }
    /* coin a kill on the switch is the as-built pull's: the same number the switch off pays */
    const asBuilt = (step) => { const n0 = ground.route.reduce((a, p) => a + ground.pockets[p].spawns.length, 0) / ground.route.length;
      const pull = Math.max(1, Math.min(DANGER.pullMax, Math.round(n0 * Math.pow(1 + DANGER.pullStep, step)))); return n0 / pull; };
    /* (lane/scale-early-grounds) read at the pay's reference (refStep, where the reference four holds) and the ground's own coin level */
    const payRef = g.refStep, level = Number.isInteger(g.coinPm) ? g.coinPm : PAY.coinPm;
    const dz = M.danger.dangerDial(ground, payRef, 4);
    if (!close(dz.coinPm, asBuilt(payRef) * level, 1e-6)) return 'on the switch a kill pays ' + dz.coinPm + ' coin permille, the as-built pull ' + asBuilt(payRef) * level;
    return null;
  },
  'dial-off'(M) {
    const ground = M.grounds.HUNT_GROUNDS.hasks_ford, g = M.dangerData.DANGER_GROUNDS.hasks_ford;
    if (g.monsters === 'formula') return 'CONTROL: the case needs a ground with its switch off';
    for (const step of [0, g.floorStep, g.refStep, g.topStep]) for (const h of [1, 2, 3]) {
      if (JSON.stringify(M.danger.dangerDial(ground, step, h)) !== JSON.stringify(M.danger.dangerDial(ground, step))) return 'off the switch the dial moved with the party\'s size (' + h + ' heroes, step ' + step + ')';
    }
    return null;
  },
  /* ARMOR (the role's armor, monsterArmorPm): a hero's blow on a formula monster lands net of it; a hand row has none (its flat def only) */
  armor(M) {
    const t = M.mf.formulaTable('muster_barrows', M.MONSTERS);
    const k = t && t.muster_knight;
    if (!k || !(k.armorPm > 0)) return 'CONTROL: the Barrow Knight has no derived armor';
    const rng = { chance: () => false, int: (a) => a };
    const N = 100000;
    const hit = (monsters, statuses) => M.hunt.damage.hurt({ world: { risk: 'steady', units: [] }, ground: { id: 'muster_barrows' }, monsters, tier: null },
      { side: 'mon', id: 2, kind: 'muster_knight', alive: true, hp: 1e9, maxHp: 1e9, ...(statuses ? { statuses } : {}) }, N, { side: 'hero', id: 1 }, null, null, rng).dmg;
    /* (lane/stage3-pipeline: on the scale every blow is the amount pipeline's, which reads no flat defense: the hand Knight takes the whole
       pipeline blow and the formula Knight that x (1000 - its armor), rounded once) */
    const hand = hit(M.MONSTERS), f = hit(t);
    const want = (hand * (1000 - k.armorPm)) / 1000;
    if (Math.abs(f - want) > 1) return 'a blow on the formula Knight landed ' + f + ', its armor ' + k.armorPm + ' over the hand Knight\'s ' + hand + ' says ' + want;
    /* off the scale (the old chain: a Tower room's derived row carries its role armor too) the armor comes off after the flat defense */
    const offScale = M.hunt.damage.hurt({ world: { risk: '', units: [] }, ground: { id: 'muster_barrows' }, monsters: t, tier: null },
      { side: 'mon', id: 2, kind: 'muster_knight', alive: true, hp: 1e9, maxHp: 1e9 }, N, { side: 'hero', id: 1 }, null, null, rng).dmg;
    const wantOff = Math.floor(((N - M.combat.defenceReduction(k)) * (1000 - k.armorPm)) / 1000);
    if (offScale !== wantOff) return 'off the scale a blow of ' + N + ' on the formula Knight landed ' + offScale + ', its armor ' + k.armorPm + ' says ' + wantOff;
    /* ARMOR BREAK (src/data/statuses.js armor_break, armorPm -250) moves the role's armor through the same door as the defence */
    const ab = M.statuses && M.statuses.STATUSES && M.statuses.STATUSES.armor_break;
    if (!ab || !(ab.armorPm < 0)) return 'CONTROL: no Armor Break row with an armorPm';
    const broken = hit(t, [{ s: 'armor_break', left: 3000 }]);
    const kept = Math.floor((k.armorPm * (1000 + ab.armorPm)) / 1000);
    const wantB = (hand * (1000 - kept)) / 1000;
    if (Math.abs(broken - wantB) > 1) return 'under Armor Break the formula Knight took ' + broken + ', its broken armor ' + kept + ' says ' + wantB;
    return null;
  },
  switch(M) {
    const ids = [...M.grounds.monstersOn(M.grounds.HUNT_GROUNDS.muster_barrows)];
    if (M.mf.formulaTable('hasks_ford', M.MONSTERS) !== null) return 'a ground with its switch off has a derived table';
    if (M.mf.formulaRow(M.MONSTERS.banded_pikeman, 'hasks_ford') !== null) return 'a ground with its switch off derives a row';
    const t = M.mf.formulaTable('muster_barrows', M.MONSTERS);
    if (!t) return 'CONTROL: Muster Barrows switched on has no derived table';
    for (const id of ids) {
      const a = M.MONSTERS[id], b = t[id];
      if (!a.role) continue;
      if (b.formula !== 'role') return id + ' is not on its derived row';
      for (const k of ['name', 'drops', 'gp', 'xp', 'cls', 'tier', 'role', 'boss']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return id + ': its ' + k + ' moved on the derived row';
    }
    if (t.rat !== M.MONSTERS.rat) return 'a monster of another ground moved';
    return null;
  },
  /* EVERY SCALE GROUND ON THE FORMULA (lane/monster-roles-ford-wings): Hask's Ford and both Catacomb wings beside Muster Barrows. On each,
     every monster that stands there names a role and plays its derived row with its content its own; the dial puts it at its derived health
     on the formula's anchor (danger.js formulaStepOf) for the reference four; a row's own wind-up keeps its id and shape with the formula's
     number (the Bone Wall's Bone Slide, the Night Carter's Lime Sack, Keeper Dunn's Snuff the Candles) and a row with none casts its role's;
     a Warder (the Bannerman) mends. At least one ground's pay reference (refStep) sits off its anchor (the wings: their measured company
     holds under the formula's), so the anchor is read, never the pay's step */
  grounds(M) {
    let kept = 0, mends = 0, apart = 0;
    for (const gid of ['muster_barrows', ...SWITCHED]) {
      const g = M.dangerData.DANGER_GROUNDS[gid], ground = M.grounds.HUNT_GROUNDS[gid];
      if (!g || !ground) return 'CONTROL: ' + gid + ' is no scale ground';
      if (!M.mf.formulaOn(gid)) return gid + ' is not on the monster formula';
      const t = M.mf.formulaTable(gid, M.MONSTERS);
      if (!t) return gid + ' on the formula has no derived table';
      /* (on the formula's anchor, danger.js formulaStepOf: the row's formulaStep where the measured reference company holds elsewhere) */
      /* (an anchor over the band's top is never stood on, the Flooded Wing's: read at the top, the step's ratio and the pull's share
         under the anchor's own pull of 4 x encounterPerHero) */
      const anchor = M.danger.formulaStepOf(g), at = Math.min(anchor, g.topStep), refPull = 4 * M.roleData.MONSTER_FORMULA.encounterPerHero;
      const dz = M.danger.dangerDial(ground, at, 4);
      if (anchor !== g.refStep) apart++;
      if (at === anchor && dz.pull[0] !== refPull) return gid + ': the reference four meets a pull of ' + dz.pull[0] + ' on the formula\'s anchor, not 4 x encounterPerHero';
      const scaleAt = Math.pow(1 + M.dangerData.DANGER.powerStep, at - anchor) * (refPull / dz.pull[0]);
      /* the pull grows from the anchor's (4 x encounterPerHero there) by pullStep a step, so at the pay's reference it is that pull's */
      const { DANGER: DZ } = M.dangerData, wantRefPull = Math.max(1, Math.min(DZ.pullMax, Math.round(refPull * Math.pow(1 + DZ.pullStep, g.refStep - anchor))));
      /* the pull at step 0, before any rounding, is sized from the anchor: where a ground's refStep sits a few steps off it the rounded pull
         can read the same either way (lane/gear-phase-b's wing re-cut put the Bone Wing's refStep on its anchor) */
      const base0 = M.danger.formulaBasePull(g, 4), want0 = refPull / M.danger.powStep(1 + DZ.pullStep, anchor);
      if (Math.abs(base0 / want0 - 1) > 1e-9) return gid + ': the pull at step 0 is ' + base0 + ', sized from the anchor ' + anchor + ' it is ' + want0;
      const refPullNow = M.danger.dangerDial(ground, g.refStep, 4).pull[0];
      if (refPullNow !== wantRefPull) return gid + ': the reference four meets a pull of ' + refPullNow + ' at refStep ' + g.refStep + ', grown from the anchor ' + anchor + ' it is ' + wantRefPull;
      for (const id of M.grounds.monstersOn(ground)) {
        const a = M.MONSTERS[id], b = t[id];
        if (!a || !M.roleData.MONSTER_ROLES[a.role]) return gid + ': ' + id + ' names no role';
        if (!b || b.formula !== 'role') return gid + ': ' + id + ' is not on its derived row';
        for (const k of ['name', 'drops', 'gp', 'xp', 'cls', 'tier', 'role', 'boss']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return gid + ': ' + id + ' its ' + k + ' moved on the derived row';
        const s = M.mf.roleStats(a.role, g, a.boss === true ? 'boss' : 'pull');
        const hp = M.tiers.atTier(b, dz).hp;
        /* (the row is written in whole points at step 0, so the dial carries its rounding: half a point of the row) */
        if (!close(hp, s.hp * scaleAt, 0.5 / b.hp + 0.001)) return gid + ': ' + id + ' stands at ' + hp + ' health at step ' + at + ', its role says ' + Math.round(s.hp * scaleAt);
        const R = M.roleData.MONSTER_ROLES[a.role], mine = M.spells.spellsOf(a).map((sid) => [sid, M.spells.spellRow(sid)]);
        const strike = mine.find(([, r]) => !M.spells.mends(r)), heal = mine.find(([, r]) => M.spells.mends(r));
        /* [the id it casts, the role's own id for that strike or mend]: the row's own when it has one, else the role's */
        const want = [...(R.windupShare > 0 ? [[strike ? strike[0] : 'mf_' + a.role, 'mf_' + a.role]] : []),
          ...(R.mend ? [[heal ? heal[0] : 'mf_' + a.role + '_mend', 'mf_' + a.role + '_mend']] : [])];
        if (JSON.stringify(b.spells || []) !== JSON.stringify(want.map(([sid]) => sid))) return gid + ': ' + id + ' casts ' + JSON.stringify(b.spells || []) + ', its role and its own rows say ' + JSON.stringify(want.map(([sid]) => sid));
        for (const [sid, roleId] of want) {
          const d = b.spellRows && b.spellRows[sid], own = M.spells.spellRow(sid);
          if (!d) return gid + ': ' + id + ' lists ' + sid + ' with no derived row';
          if (own) {
            for (const k of ['n', 'shape', 'r', 'len', 'range', 'windupMs', 'element']) if (JSON.stringify(own[k]) !== JSON.stringify(d[k])) return gid + ': ' + id + ' keeps ' + sid + ' but its ' + k + ' moved (' + JSON.stringify(own[k]) + ' -> ' + JSON.stringify(d[k]) + ')';
            kept++;
          }
          /* the number is the formula's, never the row's typed one: the same hit the role's own shape would carry */
          if (d.hitPm !== s.spells[roleId].hitPm) return gid + ': ' + id + ' ' + sid + ' hits at ' + d.hitPm + ' permille, its role at ' + s.spells[roleId].hitPm;
          if (d.shape === 'mend') mends++;
        }
      }
    }
    if (!kept) return 'CONTROL: no monster on a formula ground keeps its own wind-up';
    if (!mends) return 'CONTROL: no Warder mends on a formula ground';
    if (!apart) return 'CONTROL: every formula ground pays at its anchor (no row names a formulaStep)';
    return null;
  },
  /* THE TOWER'S ONE DOOR (src/core/hunt/tower.js rowAt, TOWER_RULES.monsters): on the formula a band's room fields its reach role's derived
     stats at the floor's Level, grown by the depth and the share; on its rows no room carries a role's armor */
  tower(M) {
    const T = M.towerData.TOWER_RULES, F = 15, mix = M.towerData.towerMixOf(F);
    if (!mix || !mix.reach) return 'CONTROL: floor ' + F + ' has no band mix with a reach';
    const rows = Object.values(M.tower.towerMonsters(F)).filter((r) => r && r.role === mix.reach && r.gp && r.gp[1] === 0);
    if (T.monsters !== 'formula') return rows.some((r) => r.armorPm > 0) ? 'on its rows the Tower fields a role\'s armor' : null;
    const r = rows.find((x) => !x.bossKind);
    if (!r) return 'CONTROL: no room monster of the band\'s reach on floor ' + F;
    const f = M.mf.formulaAt(mix.reach, r.level, r.tier, 'pull');
    const k = M.danger.stepRatio(M.tower.towerDepthOf ? M.tower.towerDepthOf(F) : M.towerData.towerDepthAt(F, T)) * M.tower.towerShareOf(F);
    if (r.armorPm !== f.armorPm || Math.abs(r.hp - Math.round(f.hp * k)) > 1) return 'a Tower room monster on the formula stands at ' + r.hp + ' health, armor ' + r.armorPm + '; its role says ' + Math.round(f.hp * k) + ', ' + f.armorPm;
    return null;
  },
  /* ONE RAMP FOR EVERY BOSS (src/data/bosses.js, lane/tower-boss-formula): a formula boss keeps its row's boss kind, so boss-phases.js ramps
     it on its own fight clock exactly as a stat-sheet boss; the formula writes no ramp of its own */
  'tower-on'(M) { return M.towerData.TOWER_RULES.monsters === 'formula' ? CASES.tower(M) : 'CONTROL: the Tower is not switched on'; },
  ramp(M) {
    const hask = M.mf.formulaRow(M.MONSTERS.captain_hask, 'muster_barrows'), knight = M.mf.formulaRow(M.MONSTERS.muster_knight, 'muster_barrows');
    if (!hask || !knight) return 'CONTROL: no derived rows';
    if (M.bosses.bossKindOf(hask) !== M.bosses.bossKindOf(M.MONSTERS.captain_hask) || !M.bosses.rampOf(hask)) return 'the formula Captain Hask lost his boss kind, so his ramp';
    if (M.bosses.rampOf(knight)) return 'a pull monster ramps';
    if ('rampPm' in hask) return 'the formula writes a second ramp on the boss';
    return null;
  },
  data(M) {
    const { MONSTER_ROLES: ROLES, MONSTER_FORMULA: F } = M.roleData;
    const BAND = { secondsToKill: [0.5, 60], pressure: [0, 0.1], windupShare: [0, 0.9], windupSize: [0, 0.5] };
    for (const [id, R] of Object.entries(ROLES)) {
      for (const [k, [lo, hi]] of Object.entries(BAND)) if (!(Number.isFinite(R[k]) && R[k] >= lo && R[k] <= hi)) return 'role ' + id + ' ' + k + ' ' + R[k] + ' is outside ' + lo + '..' + hi;
      if ((R.windupShare > 0) !== !!R.windup) return 'role ' + id + ': a wind-up share of ' + R.windupShare + ' and ' + (R.windup ? 'a' : 'no') + ' wind-up shape';
      if ((R.windupShare > 0) !== (R.windupSize > 0)) return 'role ' + id + ': a wind-up share without a size, or a size without a share';
    }
    if (!(F.encounterPerHero > 0 && F.encounterPerHero * 4 <= M.dangerData.DANGER.pullMax)) return 'encounterPerHero ' + F.encounterPerHero + ' puts the reference four past the full box';
    for (const [gid, g] of Object.entries(M.dangerData.DANGER_GROUNDS)) {
      if (!Number.isInteger(g.refLevel) || !['rows', 'formula'].includes(g.monsters)) return gid + ': a scale ground names no refLevel or a switch that is not rows / formula';
      for (const id of Object.keys(ROLES)) for (const kind of ['pull', 'boss']) {
        const s = M.mf.roleStats(id, { ...g, monsters: 'formula' }, kind);
        for (const [sid, sp] of Object.entries(s.spells)) if (!(sp.hitPm > 100 && sp.hitPm < 4000)) return gid + ' ' + id + ' ' + kind + ': ' + sid + ' is clamped at hitPm ' + sp.hitPm + ' (its dial is not what lands)';
      }
      if (g.monsters === 'formula') for (const mid of M.grounds.monstersOn(M.grounds.HUNT_GROUNDS[gid])) if (!ROLES[M.MONSTERS[mid].role]) return gid + ' is on the formula and ' + mid + ' names no role';
    }
    return null;
  },
};

/* THE PLAY: a four on Steady at a ground's reference step, ten minutes through the real settle (fixtures/play-ground.mjs) */
const ROLES4 = ['tank', 'ranger', 'mage', 'healer'];
/* `decode` (src/core/hunt/world-state.js decode): the settle hands back the world in its stored form, so its units are read through the
   engine's own decoder (lane/monster-roles-ford-wings: read as `out.world.units` they were never there, and the health check never ran) */
function playOn(P, hunt, L, step, windowMs, decode) {
  const spells = {}, hp = {}, first = {};
  const x = P.run(hunt, L, ROLES4, { spanMs: 600000, windowMs, plan: { risk: 'steady', danger: step }, onWindow: (out) => {
    for (const e of out.events || []) if (e.type === 'spell') spells[e.spell] = (spells[e.spell] || 0) + 1;
    const stored = typeof out.world === 'string' ? JSON.parse(out.world) : out.world;
    const units = decode && stored ? decode(stored).units : [];
    for (const u of units) if (u.side === 'mon') { hp[u.kind] = Math.max(hp[u.kind] || 0, u.maxHp); if (first[u.kind] === undefined) first[u.kind] = u.maxHp; }
  } });
  return { kills: x.kills, totals: JSON.stringify(x.totals), spells, hp, first };
}
const playMuster = (P, windowMs, decode) => playOn(P, 'muster_barrows', 60, 590, windowMs, decode);
/* HASK'S FORD ON THE FORMULA (lane/monster-roles-ford-wings): the first newly switched ground played whole, viewed and closed. Its Bannerman
   is the first Warder with a body and its Ledger Wight the first Caster on an open ground: the play casts the Warder's mend, the Caster's
   Hex and the Fordsunk's Heavy Blow, each Banded Pikeman stands at its derived health, and the hunt is the same kill for kill in one window
   and in 1-minute windows */
async function playFordCase(root) {
  const P = await loadPlay(root);
  const M = await load(root);
  /* (no switch control here: the Ford back on its rows casts no role's spell, and the casts below are the rule that says so) */
  const g = M.dangerData.DANGER_GROUNDS.hasks_ford;
  const one = playOn(P, 'hasks_ford', g.refLevel, g.refStep, 600000), ones = playOn(P, 'hasks_ford', g.refLevel, g.refStep, 60000, M.worldstate.decode);
  if (!(one.kills > 0)) return 'CONTROL: the four killed nothing on the Ford in ten minutes';
  if (one.totals !== ones.totals) return 'the Ford hunt moved with 1-minute windows (viewed or closed are not the one hunt): ' + one.totals.slice(0, 120) + ' vs ' + ones.totals.slice(0, 120);
  if (!(one.spells.mf_warder_mend > 0)) return 'no Warder mend was cast on the Ford in ten minutes (spells ' + JSON.stringify(one.spells) + ')';
  if (!(one.spells.mf_brute > 0)) return 'no Brute wind-up was cast on the Ford in ten minutes (spells ' + JSON.stringify(one.spells) + ')';
  if (!(one.spells.mf_caster > 0)) return 'no Caster wind-up was cast on the Ford in ten minutes (spells ' + JSON.stringify(one.spells) + ')';
  const t = M.mf.formulaTable('hasks_ford', M.MONSTERS), dz = M.danger.dangerDial(M.grounds.HUNT_GROUNDS.hasks_ford, g.refStep, 4);
  /* (the first minute's: the four starts on the reference step, then climbs or falls a few steps) */
  const want = M.tiers.atTier(t.banded_pikeman, dz).hp;
  if (!(ones.first.banded_pikeman > 0) || Math.abs(ones.first.banded_pikeman - want) > 0.05 * want) return 'a Banded Pikeman stood at ' + ones.first.banded_pikeman + ' health in the first minute, its derived row at the step ' + want;
  return null;
}
async function playCase(root) {
  const P = await loadPlay(root);
  const M = await load(root);
  if (M.dangerData.DANGER_GROUNDS.muster_barrows.monsters !== 'formula') return 'CONTROL: the play needs Muster Barrows switched on';
  const one = playMuster(P, 600000), ones = playMuster(P, 60000, M.worldstate.decode);
  if (!(one.kills > 0)) return 'CONTROL: the four killed nothing in ten minutes';
  if (one.totals !== ones.totals) return 'the hunt moved with 1-minute windows (viewed or closed are not the one hunt): ' + one.totals.slice(0, 120) + ' vs ' + ones.totals.slice(0, 120);
  if (!(one.spells.mf_brute > 0)) return 'no Brute wind-up was cast in ten minutes (spells ' + JSON.stringify(one.spells) + ')';
  const t = M.mf.formulaTable('muster_barrows', M.MONSTERS), dz = M.danger.dangerDial(M.grounds.HUNT_GROUNDS.muster_barrows, 590, 4);
  /* (the first minute's: the four starts on the reference step, then climbs or falls a few steps; read through the stored world's decoder,
     it was `undefined` before lane/monster-roles-ford-wings and the check passed without running) */
  const want = M.tiers.atTier(t.barrow_pikeman, dz).hp;
  if (!(ones.first.barrow_pikeman > 0) || Math.abs(ones.first.barrow_pikeman - want) > 0.05 * want) return 'a Pikeman stood at ' + ones.first.barrow_pikeman + ' health in the first minute, its derived row at the step ' + want;
  return null;
}
async function playOffCase(root) {
  const P = await loadPlay(root);
  const off = playMuster(P, 600000);
  if (!(off.kills > 0)) return 'CONTROL: the four killed nothing in ten minutes with the switch off';
  if (Object.keys(off.spells).some((s) => s.startsWith('mf_'))) return 'with the switch off a derived spell was cast';
  return null;
}

const MUTANTS = [
  { name: 'health ignores secondsToKill', case: 'derive', edits: [['src/core/hunt/monster-formula.js', 'const hp = R.secondsToKill * enc.killMult * ref.dpsFight * (1 - armorPm / 1000);', 'const hp = 4 * enc.killMult * ref.dpsFight * (1 - armorPm / 1000);']] },
  { name: 'health ignores armor', case: 'derive', edits: [['src/core/hunt/monster-formula.js', 'const hp = R.secondsToKill * enc.killMult * ref.dpsFight * (1 - armorPm / 1000);', 'const hp = R.secondsToKill * enc.killMult * ref.dpsFight;']] },
  { name: 'Armor Break never reaches the role armor', case: 'armor', edits: [['src/core/hunt/damage.js', "  const pm = arm > 0 ? effectPm(target, 'armorPm') : 0;", '  const pm = 0;']] },
  { name: 'armor never reaches the blow', case: 'armor', edits: [['src/core/hunt/damage.js', '  if (arm > 0 && n > 0) n = Math.floor((n * (1000 - arm)) / 1000);\n', '']] },
  /* (lane/stage3-pipeline) the amount pipeline's base share reads the role armor too */
  { name: 'armor never reaches the pipeline\'s blow', case: 'armor', edits: [['src/core/hunt/damage.js', '  if (arm > 0) mult = (mult * (1000 - arm)) / 1000;\n', '']] },
  { name: 'armor plays on a hand row', case: 'armor', edits: [['src/core/hunt/monster-formula.js', 'return row && Number.isInteger(row.armorPm) && row.armorPm > 0 ? row.armorPm : 0;', 'return row && Number.isInteger(row.armorPm) && row.armorPm > 0 ? row.armorPm : 300;']] },
  { name: 'the steady blow carries the wind-up share too', case: 'derive', edits: [['src/core/hunt/monster-formula.js', 'const steadyDps = (1 - w) * R.pressure * ref.hp;', 'const steadyDps = R.pressure * ref.hp;']] },
  { name: 'a wind-up comes on a fixed clock', case: 'derive', edits: [['src/core/hunt/monster-formula.js', '(R.windupSize / (w * R.pressure)) * F.windupScale.every);', '12 * F.windupScale.every);']] },
  { name: 'a boss is a pull monster', case: 'derive', edits: [['src/core/hunt/monster-formula.js', "const enc = F.encounters[kind] || F.encounters.pull;", 'const enc = F.encounters.pull;']] },
  { name: 'the pull ignores the party', case: 'dial', on: true, edits: [['src/core/hunt/danger.js', 'const nf = formulaBasePull(fg, heroes);', 'const nf = formulaBasePull(fg, REF_HEROES);']] },
  { name: 'coin follows the formula\'s pull', case: 'dial', on: true, edits: [['src/core/hunt/danger.js', '  return { ...dial, pull: [pull, pull, pull, pull], hpPm: each, dmgPm: each };', '  return { ...dial, pull: [pull, pull, pull, pull], hpPm: each, dmgPm: each, coinPm: dial.coinPm * (nf / pull) };']] },
  { name: 'the row is not written over the dial', case: 'dial', on: true, edits: [['src/core/hunt/monster-formula.js', 'const out = { ...row, hp: Math.max(1, Math.round(s.hp / m)),', 'const out = { ...row, hp: Math.max(1, Math.round(s.hp)),']] },
  { name: 'the switch is always on', case: 'switch', edits: [['src/core/hunt/monster-formula.js', "return g && g.monsters === 'formula' && Number.isInteger(g.refStep)", 'return g && Number.isInteger(g.refStep)']] },
  { name: 'a derived row drops its content', case: 'switch', on: true, edits: [['src/core/hunt/monster-formula.js', 'const out = { ...row, hp:', 'const out = { role: row.role, tier: row.tier, hp:']] },
  { name: 'the Tower plays the formula off its switch', case: 'tower', edits: [['src/core/hunt/tower.js', "if (run.monsters === 'formula' && reach &&", 'if (reach &&']] },
  { name: 'the Tower room never reads the depth on the formula', case: 'tower-on', edits: [TOWER_ON, ['src/core/hunt/tower.js', 'hp: Math.max(1, Math.round(f.hp * k)),', 'hp: Math.max(1, Math.round(f.hp * share)),']] },
  { name: 'a formula boss drops its boss kind', case: 'ramp', edits: [['src/core/hunt/monster-formula.js', "const kind = row.boss === true ? 'boss' : 'pull';", "const kind = row.boss === true ? 'boss' : 'pull'; row = { ...row, boss: false };"]] },
  { name: 'a role row loses its pressure', case: 'data', edits: [['src/data/monster-roles.js', 'secondsToKill: 2.5, pressure: ', 'secondsToKill: 2.5, pressur: ']] },
  /* (lane/monster-roles-ford-wings) every newly switched ground, on the tree as it ships */
  { name: 'a row\'s own wind-up is dropped for its role\'s', case: 'grounds', on: true, edits: [['src/core/hunt/monster-formula.js', '{ windup: mine.find(([, r]) => !mends(r)) || null,', '{ windup: null,']] },
  { name: 'a derived spell keeps the row\'s typed number', case: 'grounds', on: true, edits: [['src/core/hunt/monster-formula.js', '    spells[id] = Object.freeze({ ...shape, hitPm:', '    spells[id] = Object.freeze({ ...shape, hitPm: shape.hitPm ||']] },
  { name: 'a Warder never mends', case: 'grounds', on: true, edits: [['src/core/hunt/monster-formula.js', '  if (R.mend && R.mend.seconds > 0) derive(', '  if (false && R.mend && R.mend.seconds > 0) derive(']] },
  { name: 'Hask\'s Ford is back on its rows', case: 'grounds', on: true, edits: [FORD_OFF] },
  { name: 'the pull is sized from the pay\'s step, not the anchor', case: 'grounds', on: true, edits: [['src/core/hunt/danger.js', 'powStep(1 + DANGER.pullStep, formulaStepOf(g));', 'powStep(1 + DANGER.pullStep, g.refStep);']] },
  { name: 'the reference multiple reads the pay\'s step', case: 'grounds', on: true, edits: [['src/core/hunt/monster-formula.js', '  const at = formulaStepOf(g);\n', '  const at = g.refStep;\n']] },
  { name: 'a wing monster names no role', case: 'grounds', on: true, edits: [['src/data/grounds/unmarked_catacombs/pack.js', "      role: 'caster',\n      spells: ['lime_sack'],", "      spells: ['lime_sack'],"]] },
];
/* the engine half, each planted with the switch on (play, ford) or off (play-off) */
const PLAY_MUTANTS = [
  { name: 'the settle plays the hand rows on the scale', on: true, edits: [['src/core/hunt/play-rows.js', '  return onScale && formulaOn(groundId)', '  return false && formulaOn(groundId)']] },
  { name: 'a derived wind-up is never cast', on: true, edits: [['src/data/monster-spells.js', 'spellsOf(m).concat(derivedSpellsOf(m)) : []);', 'spellsOf(m) : []);']] },
  { name: 'a derived mend is never cast on the Ford', play: 'ford', edits: [['src/core/hunt/monster-formula.js', '  if (R.mend && R.mend.seconds > 0) derive(', '  if (false && R.mend && R.mend.seconds > 0) derive(']] },
  { name: 'the Ford plays its hand rows', play: 'ford', edits: [FORD_OFF] },
];

const R = makeReport('hunt-core/monster-formula');
const OFF = plant(OFF_VIEW, PLAY_TREES), TON = plant([TOWER_ON]), FOFF = plant([FORD_OFF]);
try {
  const M = await load(OFF.root), Mon = await load(ROOT), Mton = await load(TON.root), Mfoff = await load(FOFF.root);
  /* the view each case plays: the tree (on), the Ford alone on its rows (switch), the Tower on, else the off view */
  const which = (cn) => (cn === 'switch' ? Mfoff : cn === 'tower-on' ? Mton : cn === 'dial' || cn === 'ramp' || cn === 'armor' || cn === 'grounds' ? Mon : M);
  for (const [cn, fn] of Object.entries(CASES)) {
    let why = null;
    try { why = fn(which(cn)); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
  let why = null;
  try { why = await playCase(ROOT); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, 'play: ' + why);
  why = null;
  try { why = await playFordCase(ROOT); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, 'play-ford: ' + why);
  why = null;
  try { why = await playOffCase(OFF.root); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, 'play-off: ' + why);
} finally { OFF.done(); TON.done(); FOFF.done(); }
for (const mu of MUTANTS) {
  const on = mu.on === true || mu.case === 'ramp' || mu.case === 'armor';
  /* the switch's mutants play the tree with the Ford alone on its rows (its off side); the rest the tree (on) or the off view */
  const edits = mu.case === 'switch' ? [FORD_OFF, ...mu.edits] : on ? mu.edits : [...OFF_VIEW, ...mu.edits];
  const p = plant(edits);
  try {
    let why = null;
    try { why = CASES[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
for (const mu of PLAY_MUTANTS) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    let why = null;
    try { why = await (mu.play === 'ford' ? playFordCase : playCase)(p.root); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by play' + (mu.play === 'ford' ? '-ford' : '') + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(CASES).length + ' cases + play, play-ford, ' + (MUTANTS.length + PLAY_MUTANTS.length) + ' mutants caught');
R.finish();
