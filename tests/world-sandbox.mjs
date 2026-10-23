#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-sandbox.mjs — THE 64 PX SANDBOX: IN BY A SIGN, WALK, OUT BY A SIGN, NOTHING SENT.
//
//   node tests/world-sandbox.mjs           the happy path, on the real modules and manifests
//   node tests/world-sandbox.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/world/sandbox-scene.js src/world/steer-local.js src/world/store.js src/world/walk-scene.js src/world/core/map-compile.js src/data/world/sandbox.js
// mutant-writes-tree: no — mutants plant into a temp copy of src/ (and the atlas manifests)
//
// The sandbox (src/data/world/sandbox.js, src/world/sandbox-scene.js) played end to end:
//   SB-1  IN BY A SIGN: the Common shows the entry signpost (a prop with ref.scene, never
//         blocking a step); a tap on it is ONE scene switch and nothing else; the viewer's
//         choice then routes to the sandbox map
//   SB-2  THE 64 PX GRID: the sandbox compiles with T 64 on the hd64 grid, is drawn at x1 (its
//         tile the Common's on screen), from its own book: the 64 px hero, the exit sign, the
//         wanderer, nothing stubbed
//   SB-3  WALK: held keys walk the 64 px hero three tiles a second, the same feet as the town
//   SB-4  THE WANDERER: over 30 s it rests and walks (idle and walk clips), always inside its
//         leash, on open ground; display only (no plate, no ref)
//   SB-5  OUT BY A SIGN: the exit sign switches back to the Common
//   SB-6  NOTHING SENT: through enter, walk and exit, the town presence is PARKED (presenceFor):
//         no leave, no sandbox tile, only the keepalive of the tile it stood on; back in the
//         Common it stands where it stood
//   SB-7  NO COMBAT: nothing the sandbox module loads reaches the hunt engine, the hunt view or
//         the session (no intent can be sent from it)
//   SB-8  THE SWITCH: with SANDBOX.open false (a planted copy) there is no sign and the choice
//         is refused
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];

async function load(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + V);
  const [sb, data, walk, steer, store, mapc, nullb, bookm, maps, terrain, sets, camera, presence] = await Promise.all([
    'src/world/sandbox-scene.js', 'src/data/world/sandbox.js', 'src/world/walk-scene.js', 'src/world/steer-local.js', 'src/world/store.js',
    'src/world/core/map-compile.js', 'src/world/render/null-backend.js', 'src/world/core/book.js', 'src/data/world/maps/index.js',
    'src/data/world/terrain.js', 'src/data/world/atlas-sets.js', 'src/world/core/camera.js', 'src/session/town-presence.js',
  ].map(imp));
  const manifest = (set) => JSON.parse(readFileSync(join(base, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  const artOf = (list) => {
    const book = bookm.createBook(Object.fromEntries(list.map((s) => [s, manifest(s)])));
    return { book, tables: { materials: terrain.MATERIALS, sprites: book.sprites, openClasses: terrain.OPEN_CLASSES, treeClasses: terrain.TREE_CLASSES,
      lights: terrain.LIGHTS, terrains: book.terrains } };
  };
  return { sb, SANDBOX: data.SANDBOX, walk, steer, store, mapc, nullb, maps, camera, presence, base,
    baseArt: artOf(sets.ATLAS_SETS), hdArt: artOf(sets.GRID_SETS.hd64),
    rows: Object.fromEntries(maps.WORLD_MAPS.map((m) => [m.id, m])) };
}

const tick = () => new Promise((r) => setImmediate(r));

async function rules(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ' ' + msg); };
  const S = M.SANDBOX;
  const town = M.mapc.compileMap(M.rows[S.entry.map], M.baseArt.tables);
  const sand = M.mapc.compileMap(M.rows[S.map], M.hdArt.tables);
  const draw = (map, art, state) => {
    const b = M.nullb.createNullBackend({ book: M.baseArt.book, tables: M.baseArt.tables, view: { w: 40 * map.T, h: 24 * map.T } });
    b.mount(); b.setMap(map, art); b.sync(Object.assign({ name: 'Tyler', t: 0 }, state));
    return b.snapshot().last;
  };
  const tapOn = (scene, list, sprite, at) => {
    const d = list.sprites.find((x) => x.id === sprite && x.tx === at[0] && x.ty === at[1]);
    return d ? scene.tap({ tile: at, hits: [{ id: d.id, tx: d.tx, ty: d.ty, ref: d.ref }] }, 0) : null;
  };
  const navs = [];
  const nav = { walk: () => true, hunt: (h) => navs.push('hunt:' + h), skill: (k) => navs.push('skill:' + k), room: (r) => navs.push('room:' + r),
    house: (r) => navs.push('house:' + r), scene: (c) => navs.push('scene:' + c) };

  /* SB-1 IN BY A SIGN */
  const G = {};
  const inTown = M.walk.createWalkScene(town, Object.assign({ sprites: M.baseArt.tables.sprites, openClasses: [], maps: M.rows }, M.sb.sandboxExtras(town, M.baseArt.tables.sprites)));
  const tf = inTown.frame({ kind: 'town', walkers: [] }, 0);
  const sign = tf.props.find((p) => p.ref && p.ref.scene === 'sandbox');
  ok('SB-1', sign && sign.x === S.entry.at[0] && sign.y === S.entry.at[1], 'the Common must show the entry sign at ' + S.entry.at);
  ok('SB-1', town.mask[S.entry.at[1] * town.w + S.entry.at[0]] === 0, 'the entry sign must never block a step');
  const tl = draw(town, null, { hero: tf.hero, props: tf.props });
  const inAct = tapOn(inTown, tl, S.entry.sprite, S.entry.at);
  ok('SB-1', inAct && inAct.kind === 'scene' && inAct.choice === 'sandbox', 'a tap on the entry sign must switch to the sandbox, got ' + JSON.stringify(inAct));
  M.steer.runAction(inAct, nav);
  ok('SB-1', navs.join() === 'scene:sandbox', 'the tap must be ONE scene switch, got ' + navs.join());
  M.store.setChoice(G, 'sandbox');
  const sc = M.store.readScene(G);
  ok('SB-1', sc.map === S.map && sc.kind === 'sandbox', 'the sandbox choice must route to ' + S.map + ', got ' + JSON.stringify(sc));

  /* SB-2 THE 64 PX GRID */
  ok('SB-2', sand.T === 64 && sand.grid.id === 'hd64', 'the sandbox must compile on the hd64 grid (T ' + sand.T + ')');
  ok('SB-2', M.camera.zoomFor(1920, 1, sand.grid) * sand.T === M.camera.zoomFor(1920, 1, town.grid) * town.T, 'a sandbox tile must be the Common\'s on screen');
  const sx = M.sb.sandboxExtras(sand, M.hdArt.tables.sprites);
  const inSand = M.walk.createWalkScene(sand, Object.assign({ sprites: M.hdArt.tables.sprites, openClasses: [], maps: M.rows }, sx));
  const f0 = inSand.frame({ kind: 'sandbox' }, 0);
  ok('SB-2', f0.hero.id === S.hero && f0.hero.x === sand.start[0] && f0.hero.y === sand.start[1], 'the 64 px hero must stand on the start, got ' + JSON.stringify(f0.hero));
  const sl = draw(sand, M.hdArt, { hero: f0.hero, props: f0.props, units: f0.units });
  const heroD = sl.sprites.find((d) => d.id === S.hero);
  ok('SB-2', heroD && heroD.set === 'sandbox64' && heroD.w === 128, 'the hero must be drawn from the sandbox atlas at 128 px, got ' + JSON.stringify(heroD && { set: heroD.set, w: heroD.w }));
  ok('SB-2', sl.sprites.every((d) => d.set !== ''), 'nothing in the sandbox may draw as a stub: ' + sl.sprites.filter((d) => d.set === '').map((d) => d.id));
  ok('SB-2', sl.sprites.some((d) => d.id === S.monster.id) && sl.sprites.some((d) => d.id === S.exit.sprite), 'the wanderer and the exit sign must be drawn');

  /* SB-3 WALK */
  inSand.drive([1, 0], 0);
  /* the 64 px hero animates while it walks: the walk clip, frames from the sandbox atlas */
  const fMid = inSand.frame({ kind: 'sandbox' }, 450);
  const walkD = draw(sand, M.hdArt, { hero: fMid.hero }).sprites.find((d) => d.id === S.hero);
  const idleD = heroD;
  ok('SB-3', fMid.hero.anim === 'walk' && M.hdArt.book.frames(S.hero, 'walk', 'e') > 1 && walkD && walkD.set === 'sandbox64'
    && (walkD.sx !== idleD.sx || walkD.sy !== idleD.sy), 'the walking hero must play its multi-frame walk clip, got ' + fMid.hero.anim + ' / ' + M.hdArt.book.frames(S.hero, 'walk', 'e') + ' frames');
  const f1 = inSand.frame({ kind: 'sandbox' }, 1000);
  inSand.drive(null, 1000);
  ok('SB-3', f1.hero.x - sand.start[0] >= 3 - 1e-9 && f1.hero.y === sand.start[1], 'held keys must walk the hero 3 tiles east in a second, got ' + f1.hero.x);

  /* SB-4 THE WANDERER */
  const wd = M.sb.createWanderer(sand, S.monster, M.hdArt.tables.sprites);
  const cells = new Set(), anims = new Set();
  let outside = null;
  for (let t = 0; t <= 30000; t += 100) {
    const u = wd.frame(t);
    anims.add(u.anim);
    const c = wd.cell();
    cells.add(c.join());
    if (Math.max(Math.abs(c[0] - wd.home[0]), Math.abs(c[1] - wd.home[1])) > wd.leash || sand.mask[c[1] * sand.w + c[0]]) outside = c;
    if (u.plate || u.ref) outside = outside || ['plate/ref'];
  }
  ok('SB-4', cells.size > 1 && anims.has('walk') && anims.has('idle'), 'the wanderer must rest and walk in 30 s (cells ' + cells.size + ', clips ' + [...anims] + ')');
  ok('SB-4', ['s', 'e', 'n', 'w'].every((d) => M.hdArt.book.frames(S.monster.id, 'walk', d) > 1), 'the wanderer must have a multi-frame walk clip in each facing');
  ok('SB-4', !outside, 'the wanderer must stay on open ground inside its leash, display only: ' + outside);

  /* SB-5 OUT BY A SIGN */
  const outAct = tapOn(inSand, sl, S.exit.sprite, S.exit.at);
  ok('SB-5', outAct && outAct.kind === 'scene' && outAct.choice === 'town', 'a tap on the exit sign must switch back to the Common, got ' + JSON.stringify(outAct));
  M.store.setChoice(G, 'town');
  ok('SB-5', M.store.readScene(G).map === S.entry.map, 'back out, the scene must be the Common');

  /* SB-6 NOTHING SENT */
  let now = 0;
  const calls = [], timers = [];
  const server = { rpc: (name, args) => { calls.push({ name, args }); return Promise.resolve({ ok: true, body: { ok: true, walkers: [] } }); } };
  const p = new M.presence.TownPresence({ server, slot: 0, self: () => null, now: () => now,
    timers: { setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {} } });
  const place = { map: town.id, x: 5, y: 9, gx: 5, gy: 9, dir: 's' };
  M.sb.presenceFor(p, town, place);
  await tick(); await tick();
  const before = calls.length;
  for (let i = 0; i < 300; i++) {
    now += 100;
    M.sb.presenceFor(p, sand, { map: sand.id, x: 20, y: 3, gx: 20, gy: 3, dir: 'e' });
    if (i % 20 === 0) for (const fn of timers.slice()) fn();
    await tick();
  }
  const inside = calls.slice(before).filter((c) => c.name === 'hr_town_move');
  ok('SB-6', inside.every((c) => c.args.p_map === town.id && c.args.p_x === 5 && c.args.p_y === 9), 'inside the sandbox only the keepalive of the town tile may be sent: ' + JSON.stringify(inside.map((c) => c.args)));
  ok('SB-6', !calls.some((c) => c.name === 'hr_town_move' && (c.args.p_map === null || c.args.p_map === sand.id)), 'the sandbox must never leave town nor send its own tile');
  ok('SB-6', calls.every((c) => c.name === 'hr_town_move' || c.name === 'hr_town_walkers'), 'nothing but the town presence may be sent: ' + [...new Set(calls.map((c) => c.name))]);
  M.sb.presenceFor(p, town, place);
  const back = p.placeOn(town.id);
  ok('SB-6', back && back[0] === 5 && back[1] === 9, 'back in the Common the body must stand where it stood, got ' + back);
  p.destroy();

  /* SB-7 NO COMBAT: the sandbox module's whole import graph */
  const seen = new Set(), stack = ['src/world/sandbox-scene.js'];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(join(M.base, f), 'utf8').matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) stack.push(posix.normalize(posix.join(posix.dirname(f), m[1].replace(/\?.*$/, ''))));
  }
  const reach = [...seen].filter((f) => /^src\/(core\/(hunt|combat)|hunt-view\/|session\/|net\/)/.test(f));
  ok('SB-7', seen.size > 3 && !reach.length, 'the sandbox must not load the hunt engine, the hunt view or the session: ' + reach.join(', '));
  return fails;
}

/* SB-8: a copy of the tree with the switch off */
async function closedRules(M) {
  const fails = [];
  const town = M.mapc.compileMap(M.rows[M.SANDBOX.entry.map], M.baseArt.tables);
  if (M.SANDBOX.open) fails.push('SB-8 the planted copy did not close the sandbox');
  if (Object.keys(M.sb.sandboxExtras(town, M.baseArt.tables.sprites)).length) fails.push('SB-8 with the sandbox closed the Common must show no sign');
  const G = {};
  M.store.setChoice(G, 'sandbox');
  if (M.store.readScene(G).kind !== 'town') fails.push('SB-8 with the sandbox closed the choice must be refused');
  return fails;
}

function copyTree() {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-sandbox-'));
  cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor[\\/]?/.test(p.slice(ROOT.length)) });
  mkdirSync(join(tmp, 'assets/world'), { recursive: true });
  for (const f of readdirSync(join(ROOT, 'assets/world'))) if (f.endsWith('.json')) cpSync(join(ROOT, 'assets/world', f), join(tmp, 'assets/world', f));
  return tmp;
}
function plant(dir, file, from, to) {
  const text = readFileSync(join(dir, file), 'utf8');
  if (!text.includes(from)) throw new Error('anchor not found in ' + file + ': ' + from);
  writeFileSync(join(dir, file), text.replace(from, to));
}

const MUTANTS = [
  ['SB-6', 'the sandbox leaves town (show(null) instead of park())', 'src/world/sandbox-scene.js', "  if (map.kind === 'sandbox') town.park();", "  if (map.kind === 'sandbox') town.show(null);"],
  ['SB-6', 'the sandbox is shown as a town (its walkers read, its tile published)', 'src/world/sandbox-scene.js', "  if (map.kind === 'sandbox') town.park();\n  else town.show(map.kind === 'town' ? map.id : null);\n  if (map.kind === 'town') town.publish(place);", "  town.show(map.kind === 'home' ? null : map.id);\n  if (map.kind !== 'home') town.publish(place);"],
  ['SB-1', 'a sign naming a scene walks instead', 'src/world/steer-local.js', "    if (ref && ref.scene) return { kind: 'scene', choice: ref.scene };\n", ''],
  ['SB-1', 'the sandbox choice is clamped to the town', 'src/world/store.js', "choice === 'sandbox' && SANDBOX.open ? 'sandbox' : 'town'", "'town'"],
  ['SB-1', 'the walk scene drops its fixed props (no sign)', 'src/world/walk-scene.js', 'props: o.props && o.props.length ? props.concat(o.props) : props,', 'props,'],
  ['SB-2', 'the sandbox compiled on the base grid', 'src/world/core/map-compile.js', '  const grid = gridOf(row.grid);', '  const grid = gridOf(null);'],
  ['SB-4', 'the wanderer ignores its leash', 'src/world/sandbox-scene.js', '  for (let y = home[1] - row.leash; y <= home[1] + row.leash; y++) {\n    for (let x = home[0] - row.leash; x <= home[0] + row.leash; x++) {', '  for (let y = 0; y < map.h; y++) {\n    for (let x = 0; x < map.w; x++) {'],
  ['SB-7', 'the sandbox loads the hunt engine', 'src/world/sandbox-scene.js', '/* A small seeded generator', "import '../core/combat-sim.js';\n/* A small seeded generator"],
];

async function main() {
  const fails = await rules(await load(ROOT));
  const closed = copyTree();
  try {
    plant(closed, 'src/data/world/sandbox.js', '  open: true,', '  open: false,');
    fails.push(...await closedRules(await load(closed)));
  } finally { rmSync(closed, { recursive: true, force: true }); }
  if (!process.argv.includes('--mutate')) {
    for (const f of fails) console.log('  ✗ ' + f);
    const open = (await load(ROOT)).SANDBOX.open;
    console.log(fails.length ? 'world-sandbox: ' + fails.length + ' rule(s) RED'
      : 'world-sandbox: in by the sign, walked, the wanderer wandered, out by the sign; nothing sent but the parked keepalive' + (open ? '\n  REMINDER: SANDBOX.open is true. Close or delete the sandbox before the game reopens (src/data/world/sandbox.js).' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  if (fails.length) { console.log('  ✗ clean control RED: ' + fails.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [id, why, file, from, to] of MUTANTS) {
    const dir = copyTree();
    try {
      plant(dir, file, from, to);
      let f;
      try { f = await rules(await load(dir)); } catch (e) { f = [id + ' threw: ' + e.message]; }
      if (f.some((x) => x.startsWith(id))) console.log('  ✓ ' + id + ' caught: ' + why);
      else { console.log('  ✗ ' + id + ' NOT caught: ' + why + (f.length ? ' (red elsewhere: ' + f[0] + ')' : '')); bad++; }
    } catch (e) { console.log('  ✗ ' + why + ': ' + e.message); bad++; } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(bad ? 'world-sandbox --mutate FAILED: ' + bad + ' unproven' : 'world-sandbox --mutate PASSED: clean control green, ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error('world-sandbox: harness error', e && e.stack || e); process.exit(2); });
