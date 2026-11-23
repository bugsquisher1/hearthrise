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
//   ramp    a boss's blow and wind-up grow by its encounter's rampPerMinute a minute of its pull (the pull's clock, danger.js pullBegins);
//           nothing else ramps; off the scale the clock is never set.
//   data    every role carries its dials inside their bands, a wind-up shape exactly when it has a wind-up share; every scale ground names
//           its reference Level and its switch; on every scale ground the derived spell rows land inside the spell bounds unclamped (a
//           clamped row would not deal its dial); every monster of a formula ground names a role.
//   play    THE ONE ENGINE (CLAUDE.md section 6): Muster Barrows with its switch on, a four on Steady at its reference step through the real
//           settle: its monsters stand at their derived health over the dial, a Brute's wind-up (Heavy Blow) is cast, and the hunt is the
//           same, kill for kill, settled in one window and in 1-minute windows (viewed or closed); with the switch off no derived spell.
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
  M.tiers = await imp('src/data/hunt-tiers.js');
  M.grounds = await imp('src/data/hunt-grounds.js');
  M.combat = await imp('src/core/combat.js');
  M.vitals = (await imp('src/data/core-model.js')).VITALS;
  M.root = root;
  return M;
};

/* the switch on Muster Barrows, as a planted edit (the shipped row's own words) */
const MUSTER_ON = ['src/data/danger.js', "ladderTier: 5, refLevel: 60, monsters: 'rows',", "ladderTier: 5, refLevel: 60, monsters: 'formula',"];
const close = (a, b, rel) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
/* a scale ground's row with its switch on (derive reads only the row) */
const onRow = (M, id) => ({ ...M.dangerData.DANGER_GROUNDS[id], monsters: 'formula' });

const CASES = {
  derive(M) {
    const { MONSTER_ROLES: ROLES, MONSTER_FORMULA: F } = M.roleData;
    const g = onRow(M, 'muster_barrows');
    const ref = M.mf.refCompany(g.refLevel);
    if (!(ref.dpsFight > 0) || ref.hp !== M.vitals.hpBase + M.vitals.hpPerLevel * g.refLevel) return 'CONTROL: the reference company reads ' + JSON.stringify(ref);
    const take = F.REF.takePm / 1000, swingS = M.combat.COMBAT_BALANCE.tickMs / 1000;
    let winds = 0;
    for (const [id, R] of Object.entries(ROLES)) {
      const s = M.mf.roleStats(id, g, 'pull');
      if (!close(s.hp, R.secondsToKill * F.encounters.pull.killMult * ref.dpsFight, 1e-9)) return id + ': health ' + s.hp + ', not secondsToKill x the company (' + R.secondsToKill * ref.dpsFight + ')';
      const boss = M.mf.roleStats(id, g, 'boss');
      if (!close(boss.hp, s.hp * F.encounters.boss.killMult, 1e-9)) return id + ': a boss has ' + boss.hp + ' health, not killMult x ' + s.hp;
      const w = R.windup && R.windupShare > 0 ? R.windupShare : 0;
      const steady = (F.REF.hit * take * (s.top + 1)) / 2 / swingS;
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
    const r0 = at(g.refStep, 4);
    if (!close(r0.hp, s.hp, 0.002)) return 'the Knight stands at ' + r0.hp + ' health on the reference step, its derivation says ' + Math.round(s.hp);
    const top0 = M.combat.monsterMaxHit(r0);
    if (!close(top0, s.maxHit, 0.01)) return 'the Knight\'s biggest blow on the reference step is ' + top0 + ', its derivation says ' + s.maxHit.toFixed(1);
    const r20 = at(g.refStep + 20, 4);
    if (!close(r20.hp / r0.hp, Math.pow(1 + DANGER.powerStep, 20), 0.003)) return 'twenty steps deeper the Knight has x' + (r20.hp / r0.hp).toFixed(4) + ' health, not the step\'s ratio';
    for (const h of [1, 2, 3, 4]) {
      const dz = M.danger.dangerDial(ground, g.refStep, h);
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
    const dz = M.danger.dangerDial(ground, g.refStep, 4);
    if (!close(dz.coinPm, asBuilt(g.refStep) * PAY.coinPm, 1e-6)) return 'on the switch a kill pays ' + dz.coinPm + ' coin permille, the as-built pull ' + asBuilt(g.refStep) * PAY.coinPm;
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
  ramp(M) {
    const hask = M.mf.formulaRow(M.MONSTERS.captain_hask, 'muster_barrows'), knight = M.mf.formulaRow(M.MONSTERS.muster_knight, 'muster_barrows');
    const want = Math.round(1000 * M.roleData.MONSTER_FORMULA.encounters.boss.rampPerMinute);
    if (!(want > 0)) return 'CONTROL: a boss does not ramp';
    if (hask.rampPm !== want) return 'the boss carries rampPm ' + hask.rampPm + ', not ' + want;
    const inst = { monsters: { captain_hask: hask, muster_knight: knight }, world: { risk: 'steady', pullAt: 1000 } };
    if (M.mf.rampPm(inst, { kind: 'captain_hask' }, 1000) !== 1000) return 'the boss ramps at the pull\'s start';
    if (M.mf.rampPm(inst, { kind: 'captain_hask' }, 61000) !== 1000 + want) return 'a minute into the pull the boss stands at ' + M.mf.rampPm(inst, { kind: 'captain_hask' }, 61000) + ', not ' + (1000 + want);
    if (M.mf.rampPm(inst, { kind: 'muster_knight' }, 61000) !== 1000) return 'a pull monster ramps';
    if (M.mf.rampPm({ ...inst, world: { risk: 'steady', pullAt: null } }, { kind: 'captain_hask' }, 61000) !== 1000) return 'a boss ramps with no pull clock';
    const w = { risk: 'steady' }; M.danger.pullBegins(w, 5000);
    if (w.pullAt !== 5000) return 'a pull on the scale does not start its clock';
    const off = { risk: '' }; M.danger.pullBegins(off, 5000);
    if (off.pullAt !== undefined) return 'a pull off the scale starts a clock';
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

/* THE PLAY: Muster Barrows, a four on Steady at the reference step, ten minutes through the real settle (fixtures/play-ground.mjs) */
const ROLES4 = ['tank', 'ranger', 'mage', 'healer'];
function playMuster(P, windowMs) {
  const spells = {}, hp = {};
  const x = P.run('muster_barrows', 60, ROLES4, { spanMs: 600000, windowMs, plan: { risk: 'steady', danger: 590 }, onWindow: (out) => {
    for (const e of out.events || []) if (e.type === 'spell') spells[e.spell] = (spells[e.spell] || 0) + 1;
    for (const u of (out.world && out.world.units) || []) if (u.side === 'mon') hp[u.kind] = Math.max(hp[u.kind] || 0, u.maxHp);
  } });
  return { kills: x.kills, totals: JSON.stringify(x.totals), spells, hp };
}
async function playCase(root) {
  const P = await loadPlay(root);
  const M = await load(root);
  if (M.dangerData.DANGER_GROUNDS.muster_barrows.monsters !== 'formula') return 'CONTROL: the play needs Muster Barrows switched on';
  const one = playMuster(P, 600000), ones = playMuster(P, 60000);
  if (!(one.kills > 0)) return 'CONTROL: the four killed nothing in ten minutes';
  if (one.totals !== ones.totals) return 'the hunt moved with 1-minute windows (viewed or closed are not the one hunt): ' + one.totals.slice(0, 120) + ' vs ' + ones.totals.slice(0, 120);
  if (!(one.spells.mf_brute > 0)) return 'no Brute wind-up was cast in ten minutes (spells ' + JSON.stringify(one.spells) + ')';
  const t = M.mf.formulaTable('muster_barrows', M.MONSTERS), dz = M.danger.dangerDial(M.grounds.HUNT_GROUNDS.muster_barrows, 590, 4);
  const want = M.tiers.atTier(t.barrow_pikeman, dz).hp;
  if (one.hp.barrow_pikeman !== undefined && Math.abs(one.hp.barrow_pikeman - want) > 0.05 * want) return 'a Pikeman stood at ' + one.hp.barrow_pikeman + ' health, its derived row at the step ' + want;
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
  { name: 'health ignores secondsToKill', case: 'derive', edits: [['src/core/hunt/monster-formula.js', 'const hp = R.secondsToKill * enc.killMult * ref.dpsFight;', 'const hp = 4 * enc.killMult * ref.dpsFight;']] },
  { name: 'the steady blow carries the wind-up share too', case: 'derive', edits: [['src/core/hunt/monster-formula.js', 'const steadyDps = (1 - w) * R.pressure * ref.hp;', 'const steadyDps = R.pressure * ref.hp;']] },
  { name: 'a wind-up comes on a fixed clock', case: 'derive', edits: [['src/core/hunt/monster-formula.js', '(R.windupSize / (w * R.pressure)) * F.windupScale.every);', '12 * F.windupScale.every);']] },
  { name: 'a boss is a pull monster', case: 'derive', edits: [['src/core/hunt/monster-formula.js', "const enc = F.encounters[kind] || F.encounters.pull;", 'const enc = F.encounters.pull;']] },
  { name: 'the pull ignores the party', case: 'dial', edits: [MUSTER_ON, ['src/core/hunt/danger.js', 'const nf = formulaBasePull(fg, heroes);', 'const nf = formulaBasePull(fg, REF_HEROES);']] },
  { name: 'coin follows the formula\'s pull', case: 'dial', edits: [MUSTER_ON, ['src/core/hunt/danger.js', '  return { ...dial, pull: [pull, pull, pull, pull], hpPm: each, dmgPm: each };', '  return { ...dial, pull: [pull, pull, pull, pull], hpPm: each, dmgPm: each, coinPm: dial.coinPm * (nf / pull) };']] },
  { name: 'the row is not written over the dial', case: 'dial', edits: [MUSTER_ON, ['src/core/hunt/monster-formula.js', 'const out = { ...row, hp: Math.max(1, Math.round(s.hp / m)),', 'const out = { ...row, hp: Math.max(1, Math.round(s.hp)),']] },
  { name: 'the switch is always on', case: 'switch', edits: [['src/core/hunt/monster-formula.js', "return g && g.monsters === 'formula' && Number.isInteger(g.refStep)", 'return g && Number.isInteger(g.refStep)']] },
  { name: 'a derived row drops its content', case: 'switch', edits: [MUSTER_ON, ['src/core/hunt/monster-formula.js', 'const out = { ...row, hp:', 'const out = { role: row.role, tier: row.tier, hp:']] },
  { name: 'a boss never ramps', case: 'ramp', edits: [['src/core/hunt/monster-formula.js', 'if (s.rampPm > 0) out.rampPm = s.rampPm; else delete out.rampPm;', 'delete out.rampPm;']] },
  { name: 'the pull clock never starts', case: 'ramp', edits: [['src/core/hunt/danger.js', '  world.pullAt = Number.isSafeInteger(atMs) ? atMs : null;\n', '']] },
  { name: 'a role row loses its pressure', case: 'data', edits: [['src/data/monster-roles.js', 'secondsToKill: 2.5, pressure: ', 'secondsToKill: 2.5, pressur: ']] },
];
/* the engine half, each planted with the switch on (play) or off (play-off) */
const PLAY_MUTANTS = [
  { name: 'the settle plays the hand rows on the scale', on: true, edits: [['src/core/combat-sim.js', '  const monsOf = (onScale) => (onScale && formulaOn(ctx.ground.id)', '  const monsOf = (onScale) => (false && formulaOn(ctx.ground.id)']] },
  { name: 'a derived wind-up is never cast', on: true, edits: [['src/data/monster-spells.js', 'spellsOf(m).concat(derivedSpellsOf(m)) : []);', 'spellsOf(m) : []);']] },
];

const R = makeReport('hunt-core/monster-formula');
const ON = plant([MUSTER_ON], PLAY_TREES);
try {
  const M = await load(ROOT), Mon = await load(ON.root);
  const which = (cn) => (cn === 'dial' || cn === 'switch' || cn === 'ramp' ? Mon : M);
  for (const [cn, fn] of Object.entries(CASES)) {
    let why = null;
    try { why = fn(which(cn)); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
  let why = null;
  try { why = await playCase(ON.root); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, 'play: ' + why);
  why = null;
  try { why = await playOffCase(ROOT); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, 'play-off: ' + why);
} finally { ON.done(); }
for (const mu of MUTANTS) {
  const on = mu.edits.some((e) => e === MUSTER_ON) || mu.case === 'switch' || mu.case === 'ramp';
  const edits = on && !mu.edits.includes(MUSTER_ON) ? [MUSTER_ON, ...mu.edits] : mu.edits;
  const p = plant(edits);
  try {
    let why = null;
    try { why = CASES[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
for (const mu of PLAY_MUTANTS) {
  const p = plant([MUSTER_ON, ...mu.edits], PLAY_TREES);
  try {
    let why = null;
    try { why = await playCase(p.root); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by play' + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(CASES).length + ' cases + play, ' + (MUTANTS.length + PLAY_MUTANTS.length) + ' mutants caught');
R.finish();
