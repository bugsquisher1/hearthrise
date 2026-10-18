// tests/hunt-core/damage.mjs — src/core/hunt/damage.js, the one hurt() (spec §2 damage; parity RO-19, DM-13).
// Run by run-all.mjs.
import { suite, H, E, inst2, sc2, world } from './fixtures/h2.js';

const D = 'src/core/hunt/damage.js';
const fight = (M, units) => inst2(M, world(M, units, { phase: 'fight', leader: 1 }));
const src = (M, o) => H(M, 90, 1, 1, 'ranger', o);

const cases = {
  /* contract §1.5 (today's element profile): weak pays the weakness bonus, immune takes 0, neutral pays 1x. */
  'weak-resist-immune': (M) => {
    const weakId = Object.keys(M.MONSTERS).find((id) => M.MONSTERS[id].elementWeak && M.C.defenceReduction(M.MONSTERS[id]) === 0
      && !(M.MONSTERS[id].elementImmune || []).length);
    if (!weakId) return 'fixture: no monster with an element weakness';
    const el = M.MONSTERS[weakId].elementWeak;
    const t = () => E(M, 2, 0, 12, 3, 1, { kind: weakId, hp: 1000, maxHp: 1000 });
    const inst = fight(M, []);
    const weak = M.damage.hurt(inst, t(), 100, src(M), el, null).dmg;
    const want = 115; /* elements.js ELEMENT_BONUS.damage 1.15 */
    if (weak !== want) return weakId + ' weak to ' + el + ': 100 dealt ' + weak + ', expected ' + want;
    if (M.damage.hurt(inst, t(), 100, src(M), null, null).dmg !== 100) return 'a blow with no element was changed';
    const slime = E(M, 3, 0, 12, 3, 1, { kind: 'slime', hp: 8, maxHp: 8 });
    const r = M.damage.hurt(inst, slime, 100, src(M), 'ember', null);
    return r.immune && r.dmg === 0 && slime.hp === 8 ? null : 'the slime is immune to ember and took ' + r.dmg;
  },
  /* The monster's defence takes combat.js defenceReduction off every blow (one source with playerCombatRolls). */
  'def-reduction': (M) => {
    const ids = Object.keys(M.MONSTERS).filter((id) => !(M.MONSTERS[id].elementImmune || []).length);
    const id = ids.sort((a, b) => M.C.defenceReduction(M.MONSTERS[b]) - M.C.defenceReduction(M.MONSTERS[a]))[0];
    const red = M.C.defenceReduction(M.MONSTERS[id]);
    if (red < 1) return 'fixture: no monster whose defence reduces a blow';
    const m = E(M, 2, 0, 12, 3, 1, { kind: id, hp: 1000, maxHp: 1000 });
    const got = M.damage.hurt(fight(M, []), m, 20, src(M), null, null).dmg;
    return got === 20 - red ? null : id + ' (reduction ' + red + '): 20 dealt ' + got;
  },
  /* spec §3.7 stances: Offensive +10% dealt (and taken), Defensive -15% taken; dealt then taken, floored. */
  'stance-dealt-and-taken': (M) => {
    const inst = fight(M, []);
    const hit = (s, t) => M.damage.hurt(inst, H(M, 2, 12, 3, 'tank', { hp: 1000, maxHp: 1000, stance: t }), 100, src(M, { stance: s }), null, null).dmg;
    const S = M.RS.HUNT_STANCES;
    const want = (s, t) => Math.floor((Math.floor((100 * S[s].dealt) / 1000) * S[t].taken) / 1000);
    for (const [s, t] of [['offensive', 'balanced'], ['balanced', 'defensive'], ['offensive', 'defensive'], ['defensive', 'offensive']]) {
      if (hit(s, t) !== want(s, t)) return s + ' into ' + t + ': ' + hit(s, t) + ', expected ' + want(s, t);
    }
    return hit('offensive', 'balanced') === 110 && hit('balanced', 'defensive') === 85 ? null : 'the stance numbers moved';
  },
  /* A shield takes the blow first; only the rest reaches HP. */
  'shield-absorbs-first': (M) => {
    const t = H(M, 2, 12, 3, 'tank', { hp: 50, maxHp: 50 });
    t.shield = 5;
    const r = M.damage.hurt(fight(M, []), t, 8, src(M), null, null);
    return r.absorbed === 5 && t.shield === 0 && t.hp === 47 ? null : 'shield ' + t.shield + ', hp ' + t.hp + ', absorbed ' + r.absorbed;
  },
  /* Every landed blow that the element does not void deals at least 1. */
  'min-1': (M) => {
    const id = Object.keys(M.MONSTERS).find((k) => M.C.defenceReduction(M.MONSTERS[k]) >= 1);
    const m = E(M, 2, 0, 12, 3, 1, { kind: id, hp: 1000, maxHp: 1000 });
    const inst = fight(M, []);
    if (M.damage.hurt(inst, m, 1, src(M, { stance: 'defensive' }), null, null).dmg !== 1) return 'a 1-point blow into defence dealt nothing';
    return M.damage.hurt(inst, m, 0, src(M), null, null).dmg === 1 ? null : 'a landed blow of 0 must still deal 1';
  },
  /* The kill hand-off: a monster becomes a corpse, a hero is knocked out for KNOCKOUT_MS; the client hears `kill`. */
  'kill-hand-off': (M) => {
    const k = H(M, 1, 12, 3, 'tank'); const r = H(M, 2, 16, 3, 'ranger', { hp: 5, maxHp: 50 });
    const m = E(M, 3, 0, 13, 3, 1, { hp: 4 });
    const inst = fight(M, [k, r, m]);
    const sc = sc2(M, 1);
    M.damage.landHit(inst, sc, k, m, 9, null, null);
    if (m.alive || m.hp !== 0 || m.deadMs !== 0) return 'the monster did not fall';
    if (!sc.events.some((e) => e.type === 'kill' && e.u === 1 && e.t === 3)) return 'no kill event';
    const d = sc.events.find((e) => e.type === 'dmg' && e.u === 1);
    if (!d || d.ability !== 'basic' || d.element !== null) return 'the dmg event does not name its ability and element: ' + JSON.stringify(d);
    M.damage.landHit(inst, sc, k, E(M, 9, 0, 14, 3, 1, { hp: 50, maxHp: 50 }), 5, 'frost', { id: 'frost_lance' });
    if (!sc.events.some((e) => e.type === 'dmg' && e.t === 9 && e.ability === 'frost_lance' && e.element === 'frost')) return 'an ability hit lost its ability or element';
    M.damage.landHit(inst, sc, m, r, 9, null, null);
    return !r.alive && r.downMs === M.sessions.KNOCKOUT_MS ? null : 'the hero is not knocked out for KNOCKOUT_MS (' + r.downMs + ')';
  },
  /* RO-19: ranged heroes shoot while moving; Melee only standing on a tile. */
  'ranged-fires-on-move': (M) => {
    const mk = (role, x) => {
      const h = H(M, 1, x, 3, role, { fx: x - 1, prog: 300, target: 2 });
      const inst = fight(M, [h, E(M, 2, 0, x + 1, 3, 1, { hp: 1000, maxHp: 1000 })]);
      const sc = sc2(M, 1);
      M.movement.occupancy(inst);
      M.damage.resolveAttacks(inst, sc);
      return sc.events.filter((e) => e.u === 1 && (e.type === 'dmg' || e.type === 'miss')).length;
    };
    if (mk('ranger', 12) !== 1) return 'a moving ranger did not shoot';
    return mk('melee_dps', 12) === 0 ? null : 'a moving Melee hero swung';
  },
  /* DM-13: one swing per COMBAT_BALANCE.tickMs (the one basic-attack interval), the first as soon as the target is in reach. */
  'swing-every-interval': (M) => {
    const k = H(M, 1, 12, 3, 'tank', { hp: 100000, maxHp: 100000, target: 2 });
    const m = E(M, 2, 0, 13, 3, 1, { hp: 100000, maxHp: 100000 });
    const inst = fight(M, [k, m]);
    const sc = sc2(M, 1);
    const n = M.C.COMBAT_BALANCE.tickMs / 100;
    for (let i = 0; i <= n; i++) { M.movement.occupancy(inst); M.damage.resolveAttacks(inst, sc); sc.atMs += 100; }
    const swings = (u) => sc.events.filter((e) => e.u === u && (e.type === 'dmg' || e.type === 'miss')).length;
    return swings(1) === 2 && swings(2) === 2 ? null : 'in one interval + 1 sub-step: hero ' + swings(1) + ', monster ' + swings(2) + ' swings (want 2 each)';
  },
};

const mutants = [
  { name: 'the element is ignored', case: 'weak-resist-immune', edits: [[D, '    ? elementWithFloor(elementOn(target, element), source.role, partySize(inst)) : elementOn(target, element);', '    ? 1000 : 1000;']] },
  { name: 'immune still takes damage', case: 'weak-resist-immune', edits: [[D, '  if (el === 0) return { dmg: 0, absorbed: 0, killed: false, immune: true };', '']] },
  { name: 'defence is ignored', case: 'def-reduction', edits: [[D, "  if (target.side === 'mon') n -= defenceReduction(MONSTERS[target.kind]);\n", '']] },
  { name: 'the dealer\'s stance is ignored', case: 'stance-dealt-and-taken', edits: [[D, '  n = Math.floor((n * stanceOf(source).dealt) / 1000);\n', '']] },
  { name: 'the target\'s stance is ignored', case: 'stance-dealt-and-taken', edits: [[D, '  n = Math.floor((n * stanceOf(target).taken) / 1000);\n', '']] },
  { name: 'the shield is ignored', case: 'shield-absorbs-first', edits: [[D, '  if (absorbed) target.shield -= absorbed;', '  if (false) target.shield -= absorbed;']] },
  { name: 'no minimum', case: 'min-1', edits: [[D, '  n = Math.max(1, n);', '  n = Math.max(0, n);']] },
  { name: 'dmg forgets its ability', case: 'kill-hand-off', edits: [[D, "      ability: (ability && ability.id) || 'basic', element: element || null, ...(crit ? { crit: true } : {}) }));", '      element: element || null, ...(crit ? { crit: true } : {}) }));']] },
  { name: 'a fallen hero is not knocked out', case: 'kill-hand-off', edits: [['src/core/hunt/pull-cycle.js', '  u.downMs = KNOCKOUT_MS;', '  u.downMs = 0;']] },
  { name: 'Melee swings on the move', case: 'ranged-fires-on-move', edits: [[D, '    if (!row || (row.melee && !atRest(u)) || !inRange(inst, u, t)) continue;', '    if (!row || !inRange(inst, u, t)) continue;']] },
  { name: 'no swing interval', case: 'swing-every-interval', edits: [[D, 'function restart(u) { u.swingLeftMs = COMBAT_BALANCE.tickMs; }', 'function restart(u) { u.swingLeftMs = 0; }']] },
];

await suite('hunt-core/damage', cases, mutants);
