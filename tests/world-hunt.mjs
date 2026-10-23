#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-hunt.mjs — THE HUNT SCENE STAGES THE FIGHT AND CLAIMS NOTHING
//
//   node tests/world-hunt.mjs             the guard
//   node tests/world-hunt.mjs --selftest  every planted defect must be caught
//
// The World pane's hunt (src/world/{choreo,hunt-scene}.js) is fed
// by beats (src/world/beat.js: one per swing, a fight diff). These run the REAL
// engine's attended tick (src/core/hunt/world-step.js stepSwing, the same code
// the live tick calls) against the Mill Cellar map and assert the plan's
// choreography and fences (world-slice-plan §2):
//   RETIRED (lane S1): H1 ATTENDED and H8 FACING drove the scene off the old client's
//      world-less attended tick (stepSwing(null, …)), deleted with the single-foe engine; the
//      new client plays the settle's track and events instead. H4 and H9 survive, fed a fixed
//      kill-beat stream (beats()) instead of that tick.
//   H1 ATTENDED: at every swing, for tickMs 600..3600, the shown foe IS
//      G.activeMonster and stands on a tile next to the hero — a training rat
//      and the cellar hunt rolling rat/slime/wasp alike
//   H2 KNOCKOUT: an envelope fight {slime, hp 3, kills 2} with a future
//      recovering_until puts the hero down with zero floats, also when a swing
//      is reported, and up again once it has passed
//   H3 FOE SWAP: a foe the server swaps breaks off — it walks away fading,
//      leaves no corpse and plays no death; a kill is read off the fight's own
//      counter (state.fight's kills) or a foe change, never off G.stats
//   H4 NO ITEM NAME: kills that dropped real items leave a generic loot bag;
//      no dropped item's name is anywhere in the scene
//   (H5, the old overlay's Analyzer, retired 2026-10-17 with the overlay module:
//      the hunt screen's analyzer is src/shell/widgets/analyzer.js, tests/hunt-screen.mjs HS-4)
//   H6 CAMERA: the cellar at the one density (x2, never a fitted zoom); on each
//      axis the room is centred with darkness around it when it fits and the
//      camera follows the hero inside the room when it does not
//   H7 ONE ENGINE (AWAY-12, extended): the beat and the hunt modules name
//      no engine entry point
//   H8 FACING: every monster (bystander, foe, leaving, fallen; standing or
//      walking) faces east or west, never the camera (a rat's head-on frame
//      reads as a spider at 48 px)
//   H9 BAG BESIDE: a kill's loot bag lands on a tile next to the new body,
//      never on a body's tile (ART_DIRECTION §11)
// --selftest copies the closure to a temp dir, plants one defect per family,
// and requires that family to go red after a clean control.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];

async function load(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + V);
  const [sim, rng, obs, scene, camera, mapc, maps, terrain, hunts, monsters, items, sets, bookm] = await Promise.all([
    'src/core/combat-sim.js', 'src/core/rng.js', 'src/world/beat.js', 'src/world/hunt-scene.js',
    'src/world/core/camera.js', 'src/world/core/map-compile.js', 'src/data/world/maps/index.js', 'src/data/world/terrain.js',
    'src/data/hunts.js', 'src/data/monsters.js', 'src/data/items.js', 'src/data/world/atlas-sets.js', 'src/world/core/book.js',
  ].map(imp));
  const manifests = {};
  for (const set of sets.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(base, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  const book = bookm.createBook(manifests);
  const sprites = new Proxy(book.sprites, { get: (t, k) => t[k] || bookm.STUB_SPRITE });
  const tables = { materials: terrain.MATERIALS, sprites, openClasses: terrain.OPEN_CLASSES, lights: terrain.LIGHTS };
  const row = maps.WORLD_MAPS.find((m) => m.id === 'mill_cellar');
  const src = (p) => readFileSync(join(base, p), 'utf8');
  return { sim, rng, obs, scene, camera, map: mapc.compileMap(row, tables), row, hunts, MON: monsters.MONSTERS, ITEMS: items.ITEMS,
    sources: { beat: src('src/world/beat.js'), choreo: src('src/world/choreo.js'), scene: src('src/world/hunt-scene.js') } };
}

/** Kill beats as the playback delivers them: every third swing kills a rat (a little faster than the
 *  deleted attended fixture: 9 hp against max hit 5 at 80% took about four), the next steps in.
 *  The scene is fed beats, never an engine tick (H7), so a fixed beat stream is the honest input. */
function beats(M, o) {
  const hp = M.MON[o.foe].hp;
  const G = { activeMonster: o.foe, monsterHp: hp, monsterMaxHp: hp, combatKillsThisFoe: 0, playerHp: 30, playerMaxHp: 30, stats: {} };
  let n = 0;
  const tick = () => {
    const killed = (n++ % 3) === 2;
    const foeDmg = killed ? G.monsterHp : Math.max(1, Math.floor(hp / 3));
    if (killed) { G.combatKillsThisFoe++; G.monsterHp = hp; } else G.monsterHp -= foeDmg;
    return { at: 0, tickMs: o.tickMs, foe: o.foe, next: o.foe, killed, foeDmg, crit: false, miss: false, heroDmg: 0, downAfter: false };
  };
  return { G, tick };
}

const snapOf = (M, G, tickMs, down) => Object.assign(M.obs.fightOf(G), { tickMs, down: down || null });
const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const nameOf = (M) => (id) => (M.MON[id] && M.MON[id].name) || id;

function check(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push({ id, msg }); };
  const huntRow = M.hunts.HUNT_INDEX.mill_cellar;
  const newScene = (extra) => M.scene.createHuntScene(M.map, Object.assign({ huntId: 'mill_cellar', since: 'x', spawns: huntRow.spawns, nameOf: nameOf(M) }, extra));

  // H2 — knocked out: down, no floats, a server clock; pending: a mark, no clock.
  {
    const G = { activeMonster: 'slime', monsterHp: 3, monsterMaxHp: M.MON.slime.hp, combatKillsThisFoe: 2, playerHp: 0, playerMaxHp: 40, stats: {} };
    const t = 5000, until = t + 90000;
    const sc = newScene();
    sc.state(snapOf(M, G, 2400, null), t - 3000, 'Tyler');
    sc.beat({ at: t - 2500, tickMs: 2400, foe: 'slime', next: 'slime', killed: false, foeDmg: 2, crit: false, miss: false, heroDmg: 3, downAfter: false });
    const st = sc.state(snapOf(M, G, 2400, { phase: 'recovering', until }), t, 'Tyler');
    sc.beat({ at: t + 10, tickMs: 2400, foe: 'slime', next: 'slime', killed: false, foeDmg: 1, crit: false, miss: false, heroDmg: 2, downAfter: true });
    const st2 = sc.state(snapOf(M, G, 2400, { phase: 'recovering', until }), t + 20, 'Tyler');
    ok('H2', st.hero.anim === 'down' && st2.hero.anim === 'down', 'knocked out, the hero must lie down (got ' + st.hero.anim + ', ' + st2.hero.anim + ')');
    ok('H2', st.floats.length === 0 && st2.floats.length === 0, 'knocked out, no floats may draw (got ' + st.floats.length + ', ' + st2.floats.length + ')');
    ok('H2', st.foe === 'slime', 'the carried foe stays the slime (' + st.foe + ')');
    const after = sc.state(snapOf(M, G, 2400, { phase: 'recovering', until }), until + 1, 'Tyler');
    ok('H2', after.hero.anim !== 'down', 'past recovering_until the hero is back on his feet');
  }

  // H3 — a swap breaks off; kills come from the fight's counter.
  {
    const G = { activeMonster: 'rat', monsterHp: 9, monsterMaxHp: 9, combatKillsThisFoe: 4, playerHp: 30, playerMaxHp: 30, stats: { kills: 50 } };
    const sc = newScene();
    sc.state(snapOf(M, G, 2400), 1000, 'Tyler');
    G.activeMonster = 'slime'; G.monsterHp = G.monsterMaxHp = M.MON.slime.hp; G.combatKillsThisFoe = 0;
    const seen = [];
    for (let t = 1010; t < 3000; t += 100) seen.push(sc.state(snapOf(M, G, 2400), t, 'Tyler'));
    const dying = seen.some((s) => s.units.some((u) => u.anim === 'death' || u.anim === 'corpse'));
    const left = seen[1].units.find((u) => u.id === 'rat' && u.alpha != null && u.alpha < 1);
    ok('H3', !dying, 'a foe swap must never draw a death or a corpse');
    ok('H3', !!left, 'the swapped-out rat must break off (walk away, fading)');
    ok('H3', seen[seen.length - 1].foe === 'slime', 'after the swap the slime is engaged');
    const b = { foe: 'rat', foeHp: 9, foeMaxHp: 9, heroHp: 30, heroMaxHp: 30, kills: 4 };
    const meta = { at: 0, tickMs: 2400, crit: false, wasDown: false, downAfter: false };
    const viaStats = M.obs.beatOf(b, Object.assign({}, b, { foeHp: 9 }), meta);
    ok('H3', viaStats && !viaStats.killed, 'no change to the fight\'s own counter is no kill');
    const G1 = { activeMonster: 'rat', monsterHp: 2, monsterMaxHp: 9, playerHp: 30, playerMaxHp: 30, combatKillsThisFoe: 4, stats: { kills: 50 } };
    const G2 = Object.assign({}, G1, { monsterHp: 9, combatKillsThisFoe: 5, stats: { kills: 50 } });
    const k = M.obs.beatOf(M.obs.fightOf(G1), M.obs.fightOf(G2), meta);
    ok('H3', k && k.killed && k.foeDmg === 2, 'a kill is the fight counter moving (state.fight kills), with the foe\'s last HP as the blow: ' + JSON.stringify(k));
    const G3 = Object.assign({}, G1, { monsterHp: 0, stats: { kills: 51 } });
    const notKill = M.obs.beatOf(M.obs.fightOf(G1), M.obs.fightOf(G3), meta);
    ok('H3', notKill && !notKill.killed, 'G.stats.kills moving alone is not a kill the world may show');
  }

  // H4 — loot bags, no item names. Driven by kill beats as the settle's events deliver them
  // (the world-less attended tick that used to feed this is deleted with the single-foe engine).
  {
    const drops = M.MON.rat.drops.map((d) => d.id);
    const names = [...new Set(drops.map((id) => M.ITEMS[id] && (M.ITEMS[id].name || M.ITEMS[id].n)).filter(Boolean))];
    let k = 0;
    const f = beats(M, { foe: 'rat', tickMs: 2400 });
    const sc = newScene({ itemOf: () => names[k++ % names.length] });
    let t = 1000, bagSeen = false;
    const texts = [];
    for (let i = 0; i < 60; i++) {
      const b = f.tick();
      b.at = t; sc.beat(b);
      const st = sc.state(snapOf(M, f.G, 2400), t + 50, 'Tyler');
      if (st.units.some((u) => u.id === 'loot_bag')) bagSeen = true;
      for (const u of st.units.concat([st.hero])) if (u.plate) texts.push(u.plate.text);
      for (const fl of st.floats) texts.push(fl.text);
      t += 2400;
    }
    ok('H4', names.length >= 2, 'the fixture must name real drops (' + names.join(', ') + ')');
    ok('H4', bagSeen, 'a kill must leave a generic loot bag');
    const leak = names.filter((n) => texts.some((x) => x.includes(n)));
    ok('H4', !leak.length, 'an item was named before its settled receipt: ' + leak.join(', '));
  }

  // H9 — the loot bag lands beside the body, never on it (a bag on a corpse vanishes into it).
  for (const tickMs of [900, 2400]) {
    const f = beats(M, { foe: 'rat', tickMs });
    const sc = newScene();
    let t = 1000, kills = 0, bad = null;
    for (let i = 0; i < 80 && !bad; i++) {
      const b = f.tick();
      b.at = t; sc.beat(b);
      if (b.killed) {
        kills++;
        const st = sc.state(snapOf(M, f.G, tickMs), t + 20, 'Tyler');
        const tile = (u) => Math.round(u.x) + ',' + Math.round(u.y);
        const bodies = st.units.filter((u) => u.anim === 'death' || u.anim === 'corpse');
        const bags = st.units.filter((u) => u.id === 'loot_bag');
        const fresh = bodies.find((u) => u.anim === 'death' && u.age <= 20);
        if (bags.some((g) => bodies.some((c) => tile(c) === tile(g)))) bad = 'kill ' + kills + ': a bag lies on a body at ' + bags.map(tile).join(' ');
        else if (!fresh || !bags.some((g) => near(g, { x: Math.round(fresh.x), y: Math.round(fresh.y) }))) bad = 'kill ' + kills + ': no bag on a tile beside the new body';
      }
      t += tickMs;
    }
    ok('H9', !bad, 'tickMs ' + tickMs + ': ' + bad);
    ok('H9', kills >= 5, 'tickMs ' + tickMs + ': the bag fixture killed only ' + kills + ' times');
  }

  // H6 — the cellar at the one density: centred when it fits, followed when it does not.
  {
    const C = M.camera, T = 32, fr = M.map.frame;
    ok('H6', !!fr, 'the cellar row must declare its room frame');
    /* [label, window CSS width, stage device px W x H, dpr] */
    for (const [label, iw, W, H, dpr] of [['1440x900', 1440, 1240, 693, 1], ['1920x1080', 1920, 1680, 873, 1], ['1440x900@2', 1440, 2480, 1386, 2], ['922x423@3', 922, 2502, 855, 3]]) {
      const z = C.zoomFor(iw, dpr);
      ok('H6', z === 2 * dpr, label + ': the cellar must draw at the one density (x2 = ' + 2 * dpr + ' device px), got ' + z);
      if (!fr) continue;
      const vw = W / z, vh = H / z;
      for (const hero of [{ x: fr.x + 1, y: fr.y + 1 }, { x: fr.x + fr.w - 2, y: fr.y + fr.h - 2 }]) {
        const fv = C.frameView(hero, vw, vh, M.map, z, T, { keep: hero });
        const hx = (hero.x + 0.5) * T, hy = (hero.y + 0.5) * T;
        ok('H6', hx >= fv.cam.x && hx <= fv.cam.x + vw && hy >= fv.cam.y && hy <= fv.cam.y + vh, label + ': the hero at ' + hero.x + ',' + hero.y + ' is off screen');
        for (const [ax, at, span, v] of [['x', fv.cam.x, [fr.x * T, (fr.x + fr.w) * T], vw], ['y', fv.cam.y, [fr.y * T, (fr.y + fr.h) * T], vh]]) {
          const room = span[1] - span[0];
          if (room <= v) ok('H6', Math.abs(at + v / 2 - (span[0] + span[1]) / 2) <= 0.5, label + ': the room fits on ' + ax + ' and must be centred with darkness around it (camera ' + at + ')');
          else ok('H6', at >= span[0] - 0.5 && at + v <= span[1] + 0.5, label + ': the room is bigger on ' + ax + ' and the camera must scroll inside it (camera ' + at + ')');
        }
      }
    }
  }

  // H7 — one engine.
  {
    const engine = /\b(simulate[A-Z]\w*|rollAttack|rollCrit|resolveKill|resolveDeath|createRng|HearthriseCore)\b/;
    for (const [k, s] of Object.entries(M.sources)) {
      const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      ok('H7', !engine.test(code), k + ' names an engine entry point (' + (code.match(engine) || [''])[0] + '): the world draws the engine\'s tick, it never runs one');
    }
  }

  return fails;
}

const COPY = ['src/world', 'src/data', 'src/core', 'src/build-info.js', 'assets/world'];
const MUTANTS = [
  ['H2', 'floats drawn while knocked out', 'src/world/choreo.js', [['floats: down ? [] : floats.map(', 'floats: floats.map('], ['const quiet = down || b.downAfter;', 'const quiet = false;']]],
  ['H3', 'a swap kills the shown foe', 'src/world/choreo.js', [['else if (foe.id !== f.foe) { breakOff(t);', 'else if (foe.id !== f.foe) { kill({ tickMs: 0, next: null }, t);']]],
  ['H3', 'kills read off the G.stats residue', 'src/world/beat.js', [['kills: n(g.combatKillsThisFoe),', 'kills: n(g.stats && g.stats.kills),']]],
  ['H4', 'the bag names its item', 'src/world/hunt-scene.js', [["units.push({ id: 'loot_bag',", "units.push({ plate: { text: o.itemOf ? o.itemOf() : '', kind: 'ambient' }, id: 'loot_bag',"]]],
  ['H9', 'the bag lands on the corpse', 'src/world/choreo.js', [['const spot = bagSpot(at);', 'const spot = at;']]],
  ['H6', 'a room that fits is pinned to its corner, not centred', 'src/world/core/camera.js', [['if (span <= u) c = lo + (span - u) / 2;', 'if (span <= u) c = lo;']]],
  ['H6', 'a big room scrolls past its walls into the void', 'src/world/core/camera.js', [['    if (whole && span >= v) c = hold(Math.min(hi - u - b, Math.max(lo + a, c)));\n    c = Math.min(hi - u, Math.max(lo, c));\n', '']]],
  ['H7', 'the scene rolls its own swing', 'src/world/hunt-scene.js', [['    beat(b) { ch.beat(b, b.at); },', '    beat(b) { ch.beat(b, b.at); },\n    roll(r) { return rollAttack(r, 1, 2); },']]],
];

function copyTree() {
  const dir = mkdtempSync(join(tmpdir(), 'world-hunt-'));
  for (const p of COPY) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (s) => !s.endsWith('.png') });
  }
  return dir;
}
function plantIn(dir, rel, edits) {
  const f = join(dir, rel);
  let s = readFileSync(f, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  for (const [from, to] of edits) {
    const a = from.replace(/\n/g, eol);
    if (!s.includes(a)) throw new Error('mutant anchor not found in ' + rel + ': ' + from.slice(0, 60));
    s = s.replace(a, to.replace(/\n/g, eol));
  }
  writeFileSync(f, s);
}

async function selftest() {
  let bad = 0;
  const clean = copyTree();
  try {
    const f = check(await load(clean));
    if (f.length) { console.log('  ✗ clean control is RED: ' + f.map((x) => x.id + ' ' + x.msg).join(' | ')); bad++; }
    else console.log('  ✓ clean control — an unmutated copy is green');
  } finally { rmSync(clean, { recursive: true, force: true }); }
  for (const [id, why, rel, edits] of MUTANTS) {
    const dir = copyTree();
    try {
      plantIn(dir, rel, edits);
      const f = check(await load(dir));
      if (f.some((x) => x.id === id)) console.log('  ✓ ' + id + ' caught: ' + why);
      else { console.log('  ✗ ' + id + ' MISSED: ' + why + (f.length ? ' (other reds: ' + f.map((x) => x.id).join(',') + ')' : '')); bad++; }
    } catch (e) {
      console.log('  ✗ ' + id + ' could not be planted: ' + e.message); bad++;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (bad) { console.log('world-hunt --selftest FAILED'); process.exit(1); }
  console.log('world-hunt --selftest PASSED — clean control green, ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught by their own family.');
}

if (process.argv.includes('--selftest')) await selftest();
else {
  const fails = check(await load(ROOT));
  for (const f of fails) console.log('  ✗ ' + f.id + '  ' + f.msg);
  if (fails.length) { console.log('world-hunt: ' + fails.length + ' failure(s)'); process.exit(1); }
  console.log('world-hunt: green — knockout, foe swap, no item names, room camera, one engine, bags beside the body');
}
