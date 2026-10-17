// tests/hunt-core/pull-cycle.mjs — src/core/hunt/pull-cycle.js + hunt-spawn.newHuntWorld (spec §3.2 #3, #16-18;
// parity PC-02..16). A solo hunt is a party of one: every case here runs the same code a party does.
// Run by run-all.mjs.
import { suite, H, E, inst2, sc2, run, world, partyWorld, PARTY_GROUND } from './fixtures/h2.js';

const P = 'src/core/hunt/pull-cycle.js';
const firstPull = (M, inst, max) => {
  const sc = sc2(M, 3);
  let at = null;
  run(M, inst, max || 400, sc, () => { if (sc.events.some((e) => e.type === 'pull')) { at = true; return false; } return true; });
  return at ? sc : null;
};
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const strong = { maxHp: 2000, acc: 1000, maxHit: 40 };

const cases = {
  /* PC-03 / PC-04 / PC-06 + spec §3.2 #3: the leader walks to the pack, pulls inside its area, and the whole pocket turns on him. */
  'pull-on-approach': (M) => {
    const inst = partyWorld(M, [{ role: 'ranger' }, { role: 'tank' }]);
    const w = inst.world;
    if (w.leader !== 2) return 'the tank (unit 2) must lead the pull, leader is ' + w.leader;
    if (!firstPull(M, inst)) return 'no pull in 40 s';
    const k = M.movement.unitById(inst, 2);
    if (!M.leash.inArea(inst, 0, k.x, k.y)) return 'the pull started with the leader outside the pack area';
    const pack = w.units.filter((u) => u.side === 'mon' && u.pocket === 0);
    if (!pack.length || pack.some((m) => m.target !== 2)) return 'not every monster of the pocket targets the leader';
    return w.phase === 'fight' && w.packs[0].aggro && w.packs[0].holder === 2 ? null : 'the pack is not held by the leader';
  },
  /* PC-05: a kiting leader (a solo ranger: no Melee → chase off) pulls from its distance, never walking into the pack. */
  'kiter-pulls-from-range': (M) => {
    const inst = partyWorld(M, [{ role: 'ranger' }]);
    const k = inst.world.units[0];
    if (!M.roles.kites(k)) return 'fixture: a solo ranger must kite by default';
    if (!firstPull(M, inst)) return 'the kiter never pulled';
    const near = Math.min(...inst.world.units.filter((u) => u.side === 'mon' && u.pocket === 0 && u.alive).map((m) => cheb(m, k)));
    if (near > k.dist + 1) return 'the kiter pulled from ' + near + ' tiles, beyond its distance + 1';
    return near >= 2 ? null : 'the kiter walked into the pack before pulling (' + near + ' tile)';
  },
  /* PC-07 / PC-08 / PC-10: a strong solo hero clears pocket after pocket, regroups between, and loops the route. */
  'route-loops': (M) => {
    const inst = partyWorld(M, [Object.assign({ role: 'tank' }, strong)]);
    const sc = sc2(M, 5);
    const pulls = [];
    let seen = 0;
    run(M, inst, 9000, sc, () => {
      for (; seen < sc.events.length; seen++) if (sc.events[seen].type === 'pull') pulls.push(sc.events[seen].pocket);
      return inst.world.runs < 1 || pulls.length < 4;
    });
    if (JSON.stringify(pulls.slice(0, 4)) !== '[0,1,2,0]') return 'pulls went ' + JSON.stringify(pulls) + ', expected the route 0,1,2 then 0 again';
    if (!sc.events.some((e) => e.type === 'respawn')) return 'pocket 0 came back without a respawn';
    return inst.world.runs >= 1 ? null : 'the run counter did not move';
  },
  /* PC-09: a cleared pack whose timer ran out does not respawn while its pocket is mid-fight; another pocket's does. */
  'pack-not-respawn-mid-fight': (M) => {
    const inst = partyWorld(M, [{ role: 'tank' }]);
    const w = inst.world;
    for (const u of w.units) if (u.side === 'mon' && (u.pocket === 0 || u.pocket === 1)) u.alive = false;
    w.packs[0].alive = false; w.packs[0].respawnAtMs = 0;
    w.packs[1].alive = false; w.packs[1].respawnAtMs = 0;
    w.phase = 'fight'; w.routeIdx = 0;
    const sc = sc2(M, 1, 5000);
    M.hunt['pull-cycle'].respawnPacks(inst, sc);
    if (w.packs[0].alive) return 'the pocket being fought respawned mid-fight';
    if (!w.packs[1].alive || !sc.events.some((e) => e.type === 'respawn' && e.pocket === 1)) return 'an idle pocket whose timer ran out did not respawn';
    w.packs[1].alive = false; w.packs[1].respawnAtMs = 9000;
    M.hunt['pull-cycle'].respawnPacks(inst, sc2(M, 1, 8900));
    return w.packs[1].alive ? 'a pack came back before its respawn time' : null;
  },
  /* PC-02: a spawn tile someone stands on shifts to the first free tile inside the area; ids stay unique and ascending. */
  'spawn-free-tile': (M) => {
    const g = PARTY_GROUND();
    const blocker = H(M, 1, 14, 3, 'tank');
    const inst = inst2(M, world(M, [blocker], { nextId: 2, packs: g.pockets.map(() => ({})) }), g);
    M.hunt['pull-cycle'].spawnPack(inst, 0, null);
    const mons = inst.world.units.filter((u) => u.side === 'mon');
    if (mons.length !== 2) return 'expected 2 rats, got ' + mons.length;
    if (mons.some((m) => m.x === 14 && m.y === 3)) return 'a rat spawned on the hero';
    if (mons.some((m) => !M.leash.inArea(inst, 0, m.x, m.y) || cheb(m, { x: 14, y: 3 }) > 3 && !(m.x === 15 && m.y === 4))) return 'a rat spawned outside its area or beyond 3 tiles';
    if (mons[0].speed !== M.MONSTERS.rat.speed) return 'the rat does not walk at its row speed';
    return M.worldstate.validate(inst.world).length ? M.worldstate.validate(inst.world).join('; ') : null;
  },
  /* PC-11: regroup waits regroupMs AND until every hero is up and within regroupRadius of the leader. */
  'regroup-waits-for-all': (M) => {
    const T = M.tuning.HUNT_TUNING;
    const mk = (farX, down) => {
      const k = H(M, 1, 2, 8, 'tank'); const f = H(M, 2, farX, 8, 'ranger', down ? { alive: false, downMs: 600000 } : {});
      return inst2(M, world(M, [k, f], { phase: 'regroup', phaseMs: T.regroupMs, regroupNext: true, leader: 1, packs: PARTY_GROUND().pockets.map(() => ({ alive: true })) }), PARTY_GROUND());
    };
    const steps = (inst, n) => { const sc = sc2(M, 1); for (let i = 0; i < n; i++) { M.hunt['pull-cycle'].runPhase(inst, sc); sc.atMs += 100; } return inst.world.phase; };
    const near = mk(2 + T.regroupRadius);
    if (steps(near, T.regroupMs / 100 - 1) !== 'regroup') return 'regroup ended before regroupMs';
    if (steps(near, 1) !== 'travel' || near.world.routeIdx !== 1) return 'regroup did not move on to the next pocket';
    if (steps(mk(3 + T.regroupRadius), 100) !== 'regroup') return 'regroup left a hero ' + (T.regroupRadius + 1) + ' tiles behind';
    return steps(mk(4, true), 100) === 'regroup' ? null : 'regroup left a knocked-out hero behind';
  },
  /* PC-13 / PC-14 / PC-15: the leader falls → wipe: packs reset and heal, the standing walk to the entrance; he stands
     after exactly KNOCKOUT_MS at resumeHpFor(maxHp) — never a free heal. */
  'wipe-resets-pack': (M) => {
    const inst = partyWorld(M, [{ role: 'tank' }, { role: 'ranger' }]);
    const w = inst.world;
    const k = w.units[0]; const r = w.units[1];
    const rat = w.units.find((u) => u.side === 'mon' && u.pocket === 0);
    w.phase = 'fight'; w.packs[0].aggro = true; w.packs[0].holder = 1;
    for (const m of w.units) if (m.side === 'mon' && m.pocket === 0) m.target = 1;
    rat.hp = 1;
    const sc = sc2(M, 1);
    M.damage.landHit(inst, sc, rat, k, 100000, null, null);
    if (!sc.events.some((e) => e.type === 'wipe')) return 'no wipe when the leader fell';
    if (w.packs[0].aggro || rat.target !== null || rat.hp !== rat.maxHp) return 'the pack did not reset and heal';
    if (w.phase !== 'down') return 'phase is ' + w.phase + ' after a wipe';
    const seat = PARTY_GROUND().start[0];
    if (!r.goal || r.goal[0] !== seat[0] || r.goal[1] !== seat[1]) return 'the standing hero is not walking to the entrance';
    const KO = M.sessions.KNOCKOUT_MS;
    const tick = (n) => { for (let i = 0; i < n; i++) { M.hunt['pull-cycle'].runPhase(inst, sc); sc.atMs += 100; } };
    tick(KO / 100 - 1);
    if (k.alive) return 'the leader stood before KNOCKOUT_MS';
    tick(1);
    if (!k.alive || k.hp !== M.recovery.resumeHpFor(k.maxHp)) return 'the leader stood at ' + k.hp + ' HP, not resumeHpFor(maxHp)';
    return w.phase === 'regroup' && !w.regroupNext ? null : 'after the wipe the party must regroup and retry the same pocket';
  },
  /* PC-12: out of a fight heroes regain oocRegenPermillePerS of max HP a second; in a fight, nothing. */
  'ooc-regen': (M) => {
    const mk = (phase) => {
      const h = H(M, 1, 2, 8, 'tank', { hp: 100, maxHp: 200 });
      const packs = PARTY_GROUND().pockets.map((_, i) => ({ alive: i === 0, aggro: i === 0, holder: i === 0 ? 1 : null, respawnAtMs: 1e9 }));
      return [h, inst2(M, world(M, [h, E(M, 2, 0, 14, 3, 1)], { phase, leader: 1, packs }), PARTY_GROUND())];
    };
    const [h, inst] = mk('regroup');
    const sc = sc2(M, 1);
    for (let i = 0; i < 10; i++) M.hunt['pull-cycle'].runPhase(inst, sc);
    const want = 100 + Math.floor((200 * M.tuning.HUNT_TUNING.oocRegenPermillePerS) / 1000);
    if (h.hp !== want) return 'one second out of combat: ' + h.hp + ' HP, expected ' + want;
    const [f, fi] = mk('fight');
    for (let i = 0; i < 10; i++) M.hunt['pull-cycle'].runPhase(fi, sc2(M, 1));
    return f.hp === 100 ? null : 'a hero regenerated in a fight';
  },
  /* PC-16: a corpse lingers corpseMs, then is removed. */
  'corpse-removed': (M) => {
    const m = E(M, 2, 0, 13, 3, null, { alive: false, hp: 0 });
    const inst = inst2(M, world(M, [H(M, 1, 2, 8, 'tank'), m]));
    const sc = sc2(M, 1);
    const n = M.tuning.HUNT_TUNING.corpseMs / 100;
    for (let i = 0; i < n - 1; i++) M.hunt['pull-cycle'].clearCorpses(inst, sc);
    if (!inst.world.units.includes(m)) return 'the corpse went early';
    M.hunt['pull-cycle'].clearCorpses(inst, sc);
    return inst.world.units.includes(m) ? 'the corpse never went' : null;
  },
  /* engine contract #4/#5 for this lane's fields: a 4-hero party world, cut and JSON-decoded at EVERY swing,
     replays the uncut world event for event and byte for byte, and stays inside the world bound. */
  'party-world-survives-every-cut': (M) => {
    const party = ['tank', 'melee_dps', 'ranger', 'healer'].map((role) => ({ role, maxHit: 2, acc: 600 }));
    const g = PARTY_GROUND();
    const play = (cut) => {
      let w = partyWorld(M, party, g).world;
      const evs = [];
      for (let s = 0; s < 60; s++) {
        if (cut) w = M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w))));
        const r = M.worldstep.stepSwing(w, { ground: g, grid: inst2(M, w, g).grid, swingMs: 2000, atMs: s * 2000, fight: false,
          rng: M.rng.createRng(M.rng.hashSeed('cut', s)) });
        evs.push(...r.events);
        const bad = M.worldstate.validate(w);
        if (bad.length) return { bad };
      }
      return { out: JSON.stringify({ w: M.worldstate.encode(w), evs }) };
    };
    const a = play(false); const b = play(true);
    if (a.bad || b.bad) return 'the world failed validation: ' + (a.bad || b.bad).join('; ');
    if (!/"pull"/.test(a.out) || !/"dmg"/.test(a.out)) return 'the party never fought: the test would prove nothing';
    return a.out === b.out ? null : 'a world cut at every swing differs from the uncut world';
  },
};

const mutants = [
  { name: 'only one monster aggros', case: 'pull-on-approach', edits: [[P, '  for (const m of packMonsters(inst, p)) m.target = k.id;', '  packMonsters(inst, p)[0].target = k.id;']] },
  { name: 'the leader is the first hero by id', case: 'pull-on-approach', edits: [['src/core/hunt-spawn.js', 'leader: pickLeader(units),', 'leader: 1,']] },
  { name: 'a kiting leader walks into the pack', case: 'kiter-pulls-from-range',
    edits: [[P, '  if (here && kites(k) && Math.min(...mons.map((m) => cheb(m, k))) <= k.dist + 1) { startPull(inst, sc, k, p); return; }\n', '']] },
  { name: 'the route never loops', case: 'route-loops', edits: [[P, '{ w.routeIdx = 0; w.runs += 1; }', '{ w.routeIdx = inst.ground.route.length - 1; }']] },
  { name: 'a pack respawns mid-fight', case: 'pack-not-respawn-mid-fight', edits: [[P, '    if (w.phase === PHASE.FIGHT && pocketNow(inst) === p) continue;\n', '']] },
  { name: 'a spawn ignores who stands there', case: 'spawn-free-tile',
    edits: [[P, '  const taken = (x, y) => inst.occ.mon.has(tileKey(inst.grid, x, y)) || inst.occ.hero.has(tileKey(inst.grid, x, y)) || !inArea(inst, p, x, y);', '  const taken = (x, y) => !inArea(inst, p, x, y);']] },
  { name: 'regroup ignores the stragglers', case: 'regroup-waits-for-all',
    edits: [[P, '    const together = heroes(inst).every((h) => h.alive && cheb(h, k) <= HUNT_TUNING.regroupRadius);', '    const together = true;']] },
  { name: 'a wipe leaves the pack aggro', case: 'wipe-resets-pack',
    edits: [[P, '  for (let p = 0; p < inst.world.packs.length; p++) if (inst.world.packs[p].aggro) resetPack(inst, p, sc);\n', '']] },
  { name: 'a fall is a free heal', case: 'wipe-resets-pack', edits: [[P, 'h.hp = resumeHpFor(h.maxHp);', 'h.hp = h.maxHp;']] },
  { name: 'regen in a fight', case: 'ooc-regen', edits: [[P, '  const regen = inst.world.phase !== PHASE.FIGHT;', '  const regen = true;']] },
  { name: 'corpses stay forever', case: 'corpse-removed', edits: [[P, '    if (u.deadMs >= HUNT_TUNING.corpseMs) gone = true;', '']] },
  { name: 'a swing clock is not persisted', case: 'party-world-survives-every-cut',
    edits: [['src/core/hunt/damage.js', ", ['swingLeftMs', 'int']]),", ']),']] },
  { name: 'the regroup clock is not persisted', case: 'party-world-survives-every-cut',
    edits: [[P, " ['phaseMs', 'int'],", '']] },
];

await suite('hunt-core/pull-cycle', cases, mutants);
