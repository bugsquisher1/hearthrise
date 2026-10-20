#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-town-home.mjs — THE TOWN AND THE HOME DRAW THE SERVER'S WORLD
//
//   node tests/world-town-home.mjs             the guard
//   node tests/world-town-home.mjs --selftest  every planted defect must be caught
//
// The World pane's walkable scenes (lane W4: src/world/{walk-scene,town-scene,
// home-scene,steer-local}.js over src/data/world/{stations,house-layouts}.js
// and the town_common / home_cottage rows), on the real modules and the real
// atlas manifests:
//   R ROOFS: outside, every roof is drawn; inside the cottage its roof is gone
//     and the neighbour's stays; a peer standing inside a building never lifts
//     its roof (peers are units, never the hero); the inside view's south wall
//     is the stub kit with the doorway open; a walker the server reports on a
//     blocked tile is drawn on open ground beside it
//   C IN THE CLEAR: every station is in plain view, and the bench row reads as
//     occupied in the overlap grid
//   P NOT SAVED: tap-to-walk moves only G._world.pos, the residue allowlist
//     (RESIDUE_FIELDS, read from src/net/client-state.js) is frozen and holds no
//     world/position field, and nothing else in G changes
//   T PEERS WALK (src/world/town-scene.js over the TownPresence walkers): each
//     walker wears its role's style-1 outfit with a "name · level" plate and is
//     stamped ref.player (id, name, slot); it walks from its tile toward its goal
//     on its own feet; a new server answer re-aims it from where it is drawn —
//     no jump, and the walk clip runs on (its age never goes back); it turns to
//     the server's facing when it arrives; one drawn too far from the server's
//     tile jumps there; a walker the server stops naming is gone; zero walkers
//     is an empty plaza that prints nothing
//   F FURNITURE: replaced, never merged — Kitchen 2 → 3 → {} shows the rung-2
//     set, the rung-3 set, then a signpost and no kitchen piece (also through a
//     live walk scene, mask included); every room of ROOM_PERKS has one layout
//     entry per rung; every template lints with everything placed at once;
//     trophy mounts follow the server's claims and the Trophy Room
//   H THE HATCH ONLY NAVIGATES: tapping the mill hatch (or its tile) is ONE
//     navigation to Adventures with mill_cellar; the anvil opens Smithing, a
//     piece its room, a signpost the House screen, open ground a walk; the
//     world's navigation table names nothing that could send an intent
//   S STEERING: no corner cutting; a tap on a station opens it and walks next to
//     it; THE HERO NEVER WALKS ON ITS OWN (Tyler 2026-10-19): not after a tap, the
//     keys, an activity change or standing still, and a hunt ends with the hero
//     at the town's arrival point, where it stays
//   K THE KEYS: held WASD/arrows walk the same tile legs at the same speed by
//     the same no-corner-cutting rule, eight ways; let go and the step ends on
//     a tile; a key takes over from a tap walk (live b585: "WASD doesn't work")
//   M SMOOTH WALKING: a mostly-south walk faces the camera through its diagonal
//     steps; at 60 fps and the one density (x2) the hero moves 1..2 device px
//     every frame (the camera is led by the drawn pixel); the walk clip starts on
//     its first frame and runs by distance (live b585: walking toward the camera
//     looked janky)
//   D EIGHT FACINGS (ART_ROADMAP NOW-3): a diagonal step (tap, keys, or the
//     hunt hero facing its foe) carries its diagonal; art with that facing draws
//     it (the shipped style-1 outfits walk in eight), four-facing art draws the cardinal facingFor/dirOf chose,
//     and a diagonal asked for with no art falls to its nearest cardinal
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
  const [walk, town, home, steer, store, mapc, nullb, bookm, maps, terrain, sets, stations, layouts, perks, camera, facing, choreo] = await Promise.all([
    'src/world/walk-scene.js', 'src/world/town-scene.js', 'src/world/home-scene.js', 'src/world/steer-local.js', 'src/world/store.js',
    'src/world/core/map-compile.js', 'src/world/render/null-backend.js', 'src/world/core/book.js', 'src/data/world/maps/index.js',
    'src/data/world/terrain.js', 'src/data/world/atlas-sets.js', 'src/data/world/stations.js', 'src/data/world/house-layouts.js', 'src/data/perks.js', 'src/world/core/camera.js',
    'src/world/core/facing.js', 'src/world/choreo.js',
  ].map(imp));
  const manifests = {};
  for (const set of sets.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(base, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  const book = bookm.createBook(manifests);
  const tables = { materials: terrain.MATERIALS, sprites: book.sprites, openClasses: terrain.OPEN_CLASSES, treeClasses: terrain.TREE_CLASSES,
    lights: terrain.LIGHTS, terrains: book.terrains };
  const rows = Object.fromEntries(maps.WORLD_MAPS.map((m) => [m.id, m]));
  return { walk, town, home, steer, store, mapc, nullb, book, bookm, manifests, tables, rows, maps, terrain, stations, layouts, perks, camera, facing, choreo,
    residue: (await import(pathToFileURL(join(base, 'src/session/residue.js')).href)).RESIDUE_FIELDS,
    bootSrc: readFileSync(join(base, 'src/world/world-boot.js'), 'utf8') };
}

/* A walker as src/session/town-presence.js hands it on (walkerOf). */
const uidN = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const WALKER = (o) => Object.assign({ slot: 0, level: null, role: null, dir: 's' }, o);
const ENV = (extra) => Object.assign({ kind: 'idle', rooms: {}, trophies: null, roomName: (id) => id, walkers: [] }, extra);

function check(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push({ id, msg }); };
  const fam = (id, body) => { try { body(); } catch (e) { fails.push({ id: id + '!', msg: 'threw: ' + (e && e.stack || e) }); } };
  const T = 32;
  const compiled = (id) => M.mapc.compileMap(M.rows[id], M.tables);
  const town = compiled('town_common'), cottage = compiled('home_cottage');
  const frame = (map, state) => {
    const b = M.nullb.createNullBackend({ book: M.book, tables: M.tables, view: { w: 60 * T, h: 40 * T } });
    b.mount(); b.setMap(map); b.sync(Object.assign({ name: 'Tyler', t: 0 }, state));
    return b.snapshot().last;
  };
  const slices = (f, id) => f.raised.filter((d) => d.kind === 'roof' && d.building === id).length;
  /* the hero is drawn in its style-1 outfit, the knight's when the state names none */
  const HERO = 'outfit_knight';
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

  fam('R', () => {
    /* The shipped cottage is PAINTED (style 1: its floor and brick walls are the ground art) and
       has no roof; the neighbour's house, the smithy and the mill are whole building sprites. */
    const out = frame(cottage, { hero: { x: 15, y: 12 } });
    ok('R', out.heroBuilding === null && slices(out, 'cottage') === 0 && out.sprites.some((d) => d.id === 'neighbour_cottage'), 'outside, the cottage draws no roof (it is painted) and the neighbour\'s house stands');
    const inside = frame(cottage, { hero: { x: 7, y: 4 } });
    ok('R', inside.heroBuilding === 'cottage' && slices(inside, 'cottage') === 0, 'inside the cottage the hero is in it, and nothing lifts');
    const kit = inside.sprites.filter((d) => ['stub', 'wall', 'door'].includes(d.kind));
    ok('R', kit.length === 0, 'the painted cottage must draw no wall kit inside or out: ' + kit.map((d) => d.id + '@' + d.tx + ',' + d.ty).join(' '));
    const peerIn = frame(cottage, { hero: { x: 15, y: 12 }, units: [{ id: 'outfit_knight', x: 7, y: 4 }] });
    ok('R', peerIn.heroBuilding === null, 'a PEER inside the cottage must never count as the hero being in it');
    /* a walker reported on every tile of the town: none is drawn on a blocked tile (the smithy, the mill, a hedge) */
    const cast = M.town.createTownCast(town, { sprites: M.book.sprites });
    const all = [];
    for (let y = 0; y < town.h; y++) for (let x = 0; x < town.w; x++) all.push(WALKER({ id: uidN(all.length), name: 'p' + all.length, x, y, gx: x, gy: y }));
    const units = cast.frame(all, 0);
    const blocked = units.filter((u) => town.mask[Math.round(u.y) * town.w + Math.round(u.x)]);
    ok('R', units.length === all.length && !blocked.length, 'a walker reported on a blocked tile must be drawn on open ground, but ' + blocked.slice(0, 4).map((u) => u.x + ',' + u.y).join(' '));
  });

  /* C — IN THE CLEAR, read off the DRAWN frame (compose.js is the oracle, not the
     overlap grid the placement uses): forty peers drawn as units, and not one
     shares a pixel of its body with a prop, a tree, a wall or a roof, in front
     of it or behind it. Odo on the bench row (live 2026-10-14) was the case. */
  fam('C', () => {
    ok('C', town.overlap[11 * town.w + 3] !== 0, 'the bench row (3,11) must read as occupied in the overlap grid');
    for (const [k, at] of Object.entries(town.stations)) ok('C', !(town.overlap[at[1] * town.w + at[0]] & M.mapc.OVER), 'the ' + k + ' station must be in plain view');
  });

  fam('P', () => {
    const rf = M.residue;
    ok('P', Array.isArray(rf) && Object.isFrozen(rf) && rf.length > 0, 'RESIDUE_FIELDS must be a frozen allowlist in src/session/residue.js');
    const leaked = Array.isArray(rf) ? rf.filter((n) => /^(_?world|pos|position|zone|plan|walk|steer|camera)$/i.test(n)) : [];
    ok('P', !leaked.length, 'the residue allowlist must hold no world or position field: ' + leaked.join(','));
    const G = { gold: 5, rooms: { kitchen: 1 }, homestead: { tier: 1 } };
    const before = JSON.stringify(Object.assign({}, G));
    const ws = M.walk.createWalkScene(cottage, { at: M.store.heroPosOn(G, cottage.id), sprites: M.book.sprites, openClasses: M.terrain.OPEN_CLASSES, maps: M.rows });
    ws.tap({ tile: [15, 12], hits: [] }, 0);
    for (let t = 0; t <= 6000; t += 100) { const f = ws.frame(ENV({}), t); M.store.notePos(G, cottage.id, f.hero.x, f.hero.y); }
    const after = Object.assign({}, G); delete after._world;
    ok('P', JSON.stringify(after) === before, 'walking may only touch G._world: ' + JSON.stringify(after));
    ok('P', G._world && G._world.pos && G._world.pos.map === 'home_cottage' && Object.keys(G._world).sort().join() === 'choice,pos',
      'the position must live in G._world.pos beside the scene pick, and nothing else: ' + JSON.stringify(G._world));
    ok('P', JSON.stringify(M.store.heroPosOn(G, 'home_cottage')) === JSON.stringify(ws.cell()) && M.store.heroPosOn(G, 'town_common') === null,
      'heroPosOn must give back the cell on its own map only');
  });

  fam('T', () => {
    const cast = M.town.createTownCast(town, { sprites: M.book.sprites });
    const A = uidN(1), B = uidN(2), C = uidN(3);
    const t0 = 1e6;
    const w1 = [WALKER({ id: A, name: 'Wren', level: 12, role: 'healer', x: 5, y: 9, gx: 9, gy: 9, dir: 'e' }),
      WALKER({ id: B, name: 'Brannoc', level: 30, role: 'tank', x: 12, y: 9, gx: 12, gy: 9, dir: 's' }),
      WALKER({ id: C, name: 'Ilsa', level: null, role: null, x: 3, y: 9, gx: 3, gy: 9, dir: 'w' })];
    const u0 = cast.frame(w1, t0);
    const by = (list, id) => list.find((u) => u.ref && u.ref.player && u.ref.player.id === id) || null;
    ok('T', u0.length === 3, 'three walkers must give three units, got ' + u0.length);
    const wren = by(u0, A);
    ok('T', !!wren && wren.id === 'outfit_druid' && u0.filter((u) => u.id === 'outfit_knight').length === 2,
      'a walker wears its role\'s style-1 outfit (healer: druid; tank and none: knight), got ' + u0.map((u) => u.id).join(','));
    /* the outfit its character chose wins over its role's (hr_town_walkers' outfit, integration v0.2.1) */
    const dressed = M.town.createTownCast(town, { sprites: M.book.sprites })
      .frame([WALKER({ id: A, name: 'Wren', level: 12, role: 'tank', outfit: 'witch', x: 5, y: 9, gx: 5, gy: 9 })], t0);
    ok('T', dressed.length === 1 && dressed[0].id === 'outfit_witch', 'a walker whose character chose the witch outfit must wear it, got ' + dressed.map((u) => u.id).join(','));
    ok('T', !!wren && wren.plate.text === 'Wren · 12' && u0.some((u) => u.plate.text === 'Ilsa') && wren.plate.kind === 'peer', 'a plate is the name and the level: ' + u0.map((u) => u.plate.text).join(' / '));
    ok('T', !!wren && wren.ref.player.name === 'Wren' && wren.ref.player.slot === 0, 'a peer is stamped with the server\'s id, name and slot for the player menu');
    ok('T', !!wren && wren.x === 5 && wren.y === 9, 'a new walker is drawn on its reported tile first, got ' + (wren && [wren.x, wren.y]));
    if (!wren) return;
    /* walking toward its goal on its own feet */
    const mid = by(cast.frame(w1, t0 + 600), A);
    ok('T', mid.anim === 'walk' && mid.x > 5 && mid.x < 9 && mid.dir === 'e', 'half a second later Wren walks east toward 9,9: ' + JSON.stringify([mid.x, mid.anim, mid.dir]));
    /* the server answers again, a little behind her, with a new goal: she re-aims from where she is drawn */
    const before = by(cast.frame(w1, t0 + 1000), A);
    const w2 = [WALKER({ id: A, name: 'Wren', level: 12, role: 'healer', x: 7, y: 9, gx: 14, gy: 9, dir: 'e' }), w1[1], w1[2]];
    const after = by(cast.frame(w2, t0 + 1016), A);
    ok('T', Math.abs(after.x - before.x) < 0.2 && after.anim === 'walk', 'a new answer must not jump the peer: ' + before.x + ' -> ' + after.x);
    ok('T', after.age > before.age, 'the walk clip runs on through a re-aim (age ' + before.age + ' -> ' + after.age + ')');
    let end = null;
    for (let t = t0 + 1016; t <= t0 + 6000; t += 100) end = by(cast.frame(w2, t), A);
    ok('T', end.x === 14 && end.y === 9 && end.anim === 'idle' && end.dir === 'e', 'she arrives at 14,9 and stands facing the server\'s way: ' + JSON.stringify([end.x, end.y, end.anim, end.dir]));
    const turned = by(cast.frame([WALKER({ id: A, name: 'Wren', level: 12, role: 'healer', x: 14, y: 9, gx: 14, gy: 9, dir: 'n' }), w1[1], w1[2]], t0 + 6100), A);
    ok('T', turned.dir === 'n' && turned.anim === 'idle', 'a standing peer turns to a new facing without walking');
    /* far behind the server: jump */
    const far = by(cast.frame([WALKER({ id: A, name: 'Wren', level: 12, role: 'healer', x: 1, y: 9, gx: 1, gy: 9, dir: 'w' }), w1[1], w1[2]], t0 + 6200), A);
    ok('T', far.x === 1 && far.y === 9, 'a peer drawn more than snapTiles from the server\'s tile jumps there: ' + [far.x, far.y]);
    /* the server stops naming two of them */
    const left = cast.frame([w1[1]], t0 + 6300);
    ok('T', left.length === 1 && by(left, B) && cast.size() === 1, 'walkers the server stops naming are gone: ' + left.map((u) => u.plate.text).join(','));
    const empty = cast.frame([], t0 + 6400);
    ok('T', empty.length === 0 && cast.size() === 0, 'zero walkers is an empty plaza');
    /* through the walk scene: the walkers are the units, no bubble prints a count, and the hero's place is handed back */
    const ws = M.walk.createWalkScene(town, { sprites: M.book.sprites, openClasses: M.terrain.OPEN_CLASSES, maps: M.rows });
    const f = ws.frame(ENV({ walkers: w1 }), t0);
    ok('T', f.units.length === 3 && f.bubbles.length === 0, 'the walk scene draws the walkers and no bubble: ' + f.units.length + '/' + f.bubbles.length);
    const said = JSON.stringify(ws.frame(ENV({ walkers: [] }), t0 + 10).bubbles);
    ok('T', !/online|\b0\b/i.test(said), 'an empty plaza must never print a count: ' + said);
    ok('T', !!f.place && f.place.map === 'town_common' && Number.isInteger(f.place.x) && Number.isInteger(f.place.gx) && ['n', 's', 'e', 'w'].includes(f.place.dir),
      'the walk scene hands back where the hero stands and walks to, in whole tiles: ' + JSON.stringify(f.place));
  });

  fam('F', () => {
    const kitchen = M.layouts.ROOM_LAYOUTS.home_cottage.rooms.kitchen.rungs;
    const want = (r) => kitchen.slice(0, r).flat().map((p) => p.id + '@' + p.x + ',' + p.y).sort().join(' ');
    const got = (props) => props.filter((p) => p.ref && p.ref.room === 'kitchen').map((p) => p.id + '@' + p.x + ',' + p.y).sort().join(' ');
    const r2 = M.home.furnish('home_cottage', { kitchen: 2 }, null);
    const r3 = M.home.furnish('home_cottage', { kitchen: 3 }, null);
    const r0 = M.home.furnish('home_cottage', {}, null);
    ok('F', got(r2) === want(2) && got(r3) === want(3), 'Kitchen 2 then 3 must show exactly those rungs\' pieces');
    ok('F', got(r0) === '' && r0.some((p) => p.ref && p.ref.sign === 'kitchen' && p.x === kitchen[0][0].x && p.y === kitchen[0][0].y),
      'Kitchen {} must show no kitchen piece and its signpost on the first piece\'s tile');
    const ws = M.walk.createWalkScene(cottage, { at: [7, 6], sprites: M.book.sprites, openClasses: M.terrain.OPEN_CLASSES, maps: M.rows });
    const blocked = (props) => M.home.maskWith(cottage, props, M.book.sprites, M.terrain.OPEN_CLASSES)[2 * cottage.w + 7];
    const seq = [{ kitchen: 2 }, { kitchen: 3 }, {}].map((rooms, i) => ws.frame(ENV({ rooms }), i * 10));
    ok('F', got(seq[0].props) === want(2) && got(seq[1].props) === want(3) && got(seq[2].props) === '',
      'a live home must REPLACE its furniture on each envelope: ' + seq.map((f) => got(f.props)).join(' | '));
    ok('F', blocked(seq[1].props) === 1 && blocked(seq[2].props) === 1 && blocked([]) === 0, 'the hearth (or its signpost) blocks a step; an empty home does not');
    for (const [room, lv] of Object.entries(M.perks.ROOM_PERKS)) {
      const def = M.layouts.ROOM_LAYOUTS.home_cottage.rooms[room];
      ok('F', def && def.rungs.length === lv.length, 'room ' + room + ' needs one layout entry per rung (' + lv.length + '), has ' + (def ? def.rungs.length : 'none'));
    }
    for (const t of M.layouts.HOUSE_TEMPLATES) {
      const row = M.rows[t.map];
      ok('F', row && row.kind === 'home', 'template ' + t.id + ' names map ' + t.map + ' which is not a home map');
      if (row) for (const p of M.home.lintLayout(row, M.tables)) ok('F', false, p.code + ' ' + p.msg);
    }
    ok('F', M.home.homeMapFor(null) === M.layouts.HOUSE_TEMPLATES[0].map && M.home.homeMapFor(9) === M.layouts.HOUSE_TEMPLATES[M.layouts.HOUSE_TEMPLATES.length - 1].map,
      'an unknown rung shows the first template, a high one the last');
    const claims = { rows: [{ stage: 4 }, { stage: 1 }] };
    const mounts = (rooms, t) => M.home.furnish('home_cottage', rooms, t).filter((p) => p.ref && p.ref.room === 'trophy' && /^(trophy_wolf|shield_wall|banner|swords_wall)$/.test(p.id) && p.y === 1 && M.layouts.ROOM_LAYOUTS.home_cottage.trophyMounts.some(([x, y]) => x === p.x && y === p.y));
    ok('F', mounts({ trophy: 1 }, claims).map((p) => p.id).join() === M.layouts.TROPHY_MOUNT_SPRITES[4] + ',' + M.layouts.TROPHY_MOUNT_SPRITES[1],
      'one mount per claimed trophy, by stage, highest first');
    ok('F', mounts({}, claims).length === 0 && mounts({ trophy: 1 }, null).length === 0, 'no mount before the Trophy Room is built, or while the claims are unknown');
  });

  fam('H', () => {
    const o = { opens: M.stations.TAP_OPENS, maps: M.rows };
    const hatch = town.objects.find((x) => x.id === 'hatch');
    const calls = [];
    const nav = new Proxy({}, { get: (t, k) => (...a) => { calls.push([k].concat(a)); return true; } });
    const act = M.steer.tapAction(town, { tile: [hatch.x, hatch.y], hits: [{ id: 'hatch', tx: hatch.x, ty: hatch.y, ref: null }] }, o);
    M.steer.runAction(act, nav);
    ok('H', JSON.stringify(calls) === JSON.stringify([['hunt', 'mill_cellar']]), 'the hatch must be ONE navigation to Adventures on mill_cellar, got ' + JSON.stringify(calls));
    const tileOnly = M.steer.tapAction(town, { tile: [hatch.x, hatch.y], hits: [] }, o);
    ok('H', tileOnly.kind === 'hunt' && tileOnly.hunt === 'mill_cellar', 'the hatch\'s tile alone opens it too');
    const anvil = town.objects.find((x) => x.id === 'anvil');
    ok('H', M.steer.tapAction(town, { tile: [0, 0], hits: [{ id: 'oak', tx: 9, ty: 3, ref: null }, { id: 'anvil', tx: anvil.x, ty: anvil.y, ref: null }] }, o).skill === 'smithing',
      'the anvil under a tree canopy opens Smithing');
    ok('H', M.steer.tapAction(cottage, { tile: [7, 2], hits: [{ id: 'hearth', tx: 7, ty: 2, ref: { room: 'kitchen' } }] }, o).room === 'kitchen', 'a piece opens its room');
    ok('H', M.steer.tapAction(cottage, { tile: [7, 2], hits: [{ id: 'signpost', tx: 7, ty: 2, ref: { sign: 'kitchen' } }] }, o).kind === 'house', 'a signpost opens the House screen');
    const walk = M.steer.tapAction(town, { tile: [11, 9], hits: [{ id: 'hero', tx: 11, ty: 9, ref: null }] }, o);
    ok('H', walk.kind === 'walk' && walk.to.join() === '11,9', 'open ground is a walk');
    const exit = M.steer.tapAction(cottage, { tile: [22, 12], hits: [] }, o);
    ok('H', exit.kind === 'scene' && exit.choice === 'town', 'the home lane\'s exit leads to the town scene');
    const navSrc = (M.bootSrc.match(/const nav = \{[\s\S]*?\n {2}\};/) || [''])[0] + (M.bootSrc.match(/function openHunt\(id\) \{[\s\S]*?\n {2}\}/) || [''])[0];
    ok('H', navSrc.length > 200 && !/startHunt|huntIntent|startCombat|declareActivity|upgradeRoom|buyUnlock|rpc|fetch|stopCombat|startSkill/.test(navSrc),
      'the world\'s navigation table must name nothing that sends an intent');
  });

  fam('S', () => {
    const s = M.steer.createSteer({ mask: Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0]), w: 3, h: 3 }, [0, 0]);
    const cells = [s.cell().join()];
    s.walkTo([1, 1], 0, true);
    for (let t = 0; t <= 3000; t += 50) { s.step(t); const c = s.cell().join(); if (cells[cells.length - 1] !== c) cells.push(c); }
    ok('S', cells.join(' ') === '0,0 0,1 1,1', 'with a wall at 1,0 the walk must go around the corner, went ' + cells.join(' '));
    /* THE HERO NEVER WALKS ON ITS OWN (Tyler 2026-10-19). A tap on a station opens it AND walks there. */
    const ws = M.walk.createWalkScene(town, { at: [11, 9], sprites: M.book.sprites, openClasses: M.terrain.OPEN_CLASSES, maps: M.rows });
    const act = ws.tap({ tile: [6, 8], hits: [{ id: 'anvil', tx: 6, ty: 8, ref: null }] }, 0);   // the anvil: a station, blocked
    let f = null;
    for (let t = 0; t <= 2500; t += 50) f = ws.frame(ENV({ kind: 'gather' }), t);
    const c = ws.cell();
    ok('S', act.kind === 'skill' && !(c[0] === 6 && c[1] === 8) && dist2(c, [6, 8]) <= 2 && f.mark === null,
      'a tap on the anvil opens it and walks the hero next to it, the mark clearing on arrival: ' + act.kind + ' at ' + c.join());
    const at3 = ws.cell().join();
    for (let t = 2500; t <= 20000; t += 50) f = ws.frame(ENV({ kind: 'gather' }), t);
    ok('S', ws.cell().join() === at3 && f.hero.anim === 'idle', 'a hero the player sent must stay where it arrived (' + at3 + '), walked to ' + ws.cell().join());
    ws.drive([1, 0], 20000); ws.drive(null, 20000);
    let kt = 20000;
    for (; kt <= 21000; kt += 50) ws.frame(ENV({ kind: 'gather' }), kt);
    const atKeys = ws.cell().join();
    ok('S', atKeys !== at3, 'the keys must walk the hero');
    for (; kt <= 36000; kt += 100) ws.frame(ENV({ kind: 'gather' }), kt);
    ok('S', ws.cell().join() === atKeys, 'a hero stopped after the keys must stay put (' + atKeys + '), walked to ' + ws.cell().join());
    /* A NEW activity (the server's pointer changed, no player input) moves nobody. */
    for (; kt <= 60000; kt += 100) f = ws.frame(ENV({ kind: 'combat' }), kt);
    ok('S', ws.cell().join() === atKeys && f.hero.anim === 'idle', 'an activity change must not walk the hero (' + atKeys + '), walked to ' + ws.cell().join());
    const lean = f.camera;
    const here = ws.cell();
    ok('S', lean && town.focus && Math.abs(lean.x - (here[0] + town.focus[0]) / 2) < 1e-9, 'the camera leans halfway to the town\'s focus');
    /* A HUNT ENDS AT THE ARRIVAL POINT (live v0.2.7: "walks to a random location after I leave a hunt"): the
       World forgets the hero's town spot when it enters a hunt, so the next town scene starts at the map's
       start, and there it stays for 15 s, through the activity the server resumes. */
    const G = { _world: { choice: 'town', pos: { map: town.id, x: 3, y: 9 } } };
    M.store.forgetPos(G);
    ok('S', M.store.heroPosOn(G, town.id) === null, 'entering a hunt must forget the hero\'s town spot');
    ok('S', /walk = null; lastWalk = null; keys\.clear\(\); forgetPos\(G\);/.test(M.bootSrc), 'the hunt branch of world-boot.js must forget the town spot');
    const t0 = 1.7e12;   // a wall clock, as the pane passes Date.now()
    const back = M.walk.createWalkScene(town, { at: M.store.heroPosOn(G, town.id), sprites: M.book.sprites, openClasses: M.terrain.OPEN_CLASSES, maps: M.rows });
    for (let t = t0; t < t0 + 15000; t += 100) back.frame(ENV({ kind: t < t0 + 2000 ? 'combat' : 'gather' }), t);
    ok('S', back.cell().join() === town.start.join(), 'a hero back from a hunt must stand at the arrival point ' + town.start.join() + ', moved to ' + back.cell().join());
  });

  /* K — THE KEYS (live b585: "WASD doesn't work"). Held keys walk the same feet
     a tap does: tile legs at the tap's speed, the planner's no-corner-cutting
     rule, eight ways; let go and the step in progress ends on a whole tile. */
  fam('K', () => {
    const open5 = { mask: new Uint8Array(25), w: 5, h: 5 };
    const legMs = 1000 / M.steer.WALK_TILES_PER_S;
    const s = M.steer.createSteer(open5, [2, 0]);
    s.drive([0, 1], 0);
    const mid = s.step(legMs / 2);
    ok('K', mid.moving && mid.dir === 's' && mid.x === 2 && Math.abs(mid.y - 0.5) < 1e-9, 'holding S must walk south at the tap\'s speed: ' + JSON.stringify(mid));
    const on = s.step(2.5 * legMs);
    ok('K', on.moving && s.cell().join() === '2,3', 'a held key keeps stepping tile after tile, at ' + s.cell().join());
    s.drive(null, 2.5 * legMs);
    const stop = s.step(10 * legMs);
    ok('K', !stop.moving && stop.x === 2 && stop.y === 3, 'let go mid-step, the hero finishes that step and stops on the tile: ' + JSON.stringify(stop));
    const d = M.steer.createSteer(open5, [0, 0]);
    d.drive([1, 1], 0);
    d.step(Math.SQRT2 * legMs + 1);
    ok('K', d.cell().join() === '2,2', 'S+D held walks the diagonal, one diagonal tile per sqrt2 legs: at ' + d.cell().join());
    const late = M.steer.createSteer(open5, [2, 0]);
    late.drive([0, 1], 0);
    late.drive([1, 1], 40);   // the second key lands a frame or two after the first
    ok('K', late.cell().join() === '3,1', 'S then D a moment later must walk the diagonal, not a straight step first: stepping onto ' + late.cell().join());
    const walled = M.steer.createSteer({ mask: Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0]), w: 3, h: 3 }, [0, 0]);
    walled.drive([1, 1], 0);
    walled.step(legMs - 1);
    ok('K', walled.cell().join() === '0,1', 'a held diagonal past a wall corner must not cut it; it slides along the open side, went ' + walled.cell().join());
    const wall = M.steer.createSteer(open5, [0, 0]);
    wall.drive([-1, 0], 0);
    const faced = wall.step(1000);
    ok('K', !faced.moving && faced.x === 0 && faced.dir === 'w' && wall.restMs(5e4) === 0, 'held against the map edge the hero turns to face it, stays put and never counts as idle: ' + JSON.stringify(faced));
    const ws = M.walk.createWalkScene(town, { at: [11, 9], sprites: M.book.sprites, openClasses: M.terrain.OPEN_CLASSES, maps: M.rows });
    ws.tap({ tile: [11, 4], hits: [] }, 0);
    ws.frame(ENV(), 100);
    ws.drive([1, 0], 100);
    let f = null;
    for (let t = 100; t <= 100 + 3 * legMs; t += 16) f = ws.frame(ENV(), t);
    /* the tap's first step north had barely begun, so the key re-aims it: the hero turns east on row 9 */
    ok('K', f.mark === null && f.hero.dir === 'e' && f.hero.y === 9 && f.hero.x > 12, 'a key takes over from a tap walk: the tap path and its mark are dropped, got ' + JSON.stringify([f.mark, f.hero]));
  });

  /* M — A WALK THAT MOVES SMOOTHLY (live b585: walking toward the camera looked janky).
     Read off the frames the pane paints: the facing through a mostly-south walk,
     the hero's screen step per 60 fps frame at both densities the camera ships
     (x2, and x3 on a window wider than WIDE_CSS), and the walk clip's phase. */
  for (const z of [M.camera.zoomFor(1600, 1), M.camera.zoomFor(M.camera.WIDE_CSS + 160, 1)]) fam('M', () => {
    /* a stage 300 art px tall at either density, so the camera scrolls with the walk */
    const W = 1600, H = 300 * z;
    const ws = M.walk.createWalkScene(town, { at: [10, 3], sprites: M.book.sprites, openClasses: M.terrain.OPEN_CLASSES, maps: M.rows });
    let t = 1.7e12;
    ws.frame(ENV(), t);
    ws.tap({ tile: [12, 9], hits: [] }, t);
    const dirs = new Set(), steps = [], phases = [];
    let prev = null, first = null, last = null, idleAge = null;
    for (let k = 0; k < 200; k++) {
      t += 1000 / 60;
      const f = ws.frame(ENV(), t);
      if (f.hero.anim !== 'walk') { idleAge = f.hero.age; break; }
      if (!first) first = f.hero;
      last = f.hero;
      dirs.add(f.hero.dir);
      const fv = M.camera.frameView(f.camera, W / z, H / z, town, z, T);
      const sy = Math.round(f.hero.y * T) * z - Math.round(fv.cam.y * z);
      const camFree = fv.cam.y > 0 && fv.cam.y < town.h * T - H / z;
      if (prev !== null && camFree) steps.push(sy - prev);
      prev = sy;
      phases.push(f.hero.age);
    }
    ok('M', dirs.size === 1 && dirs.has('s'), 'a walk mostly south must face the camera all the way, through its diagonal steps; faced ' + [...dirs].join(','));
    ok('M', z === 2 || z === 3, 'the densities are x2 and x3, got ' + z);
    ok('M', steps.length > 20 && steps.every((d) => d >= 1 && d <= z), 'at 60 fps the hero must move 1..' + z + ' device px down the screen every frame (never stall, never jump): ' + steps.join(' '));
    const clip = M.book.sprite(HERO).anims.walk;
    const frameAt = (age) => Math.floor((age * clip.fps) / 1000) % clip.dirs.s.length;
    ok('M', first && first.age != null && frameAt(first.age) === 0, 'a walk must start on its clip\'s first frame, started on ' + (first && first.age != null ? frameAt(first.age) : 'a wall-clock frame'));
    ok('M', last && last.age != null && phases.every((a, i) => !i || a >= phases[i - 1]), 'the walk clip must advance with the distance walked');
    ok('M', idleAge != null && idleAge < 1000 / 60 + 1, 'standing again, the idle clip starts from its first frame (age ' + idleAge + ')');
  });

  /* D — EIGHT FACINGS (ART_ROADMAP NOW-3). A diagonal step carries its diagonal;
     an atlas that has that facing draws it, one that has four draws exactly the
     cardinal facingFor/dirOf chose, as before. "eight" is the shipped hero with
     diagonal clips planted (marked frames), the way PixelLab batch R2 will add them. */
  fam('D', () => {
    const MARK = 100000, DIAG = ['se', 'sw', 'ne', 'nw'];
    const man = JSON.parse(JSON.stringify(M.manifests));
    /* The shipped hero (its style-1 outfit) walks in eight; "four" is that outfit with its diagonals taken out. */
    const heroSet = Object.keys(man).find((k) => man[k].sprites && man[k].sprites[HERO]);
    for (const a of Object.values(man[heroSet].sprites[HERO].anims)) DIAG.forEach((d, k) => { a.dirs[d] = a.dirs.s.map(([sx, sy]) => [sx, sy + (k + 1) * MARK]); });
    const eight = M.bookm.createBook(man);
    const man4 = JSON.parse(JSON.stringify(M.manifests));
    for (const a of Object.values(man4[heroSet].sprites[HERO].anims)) for (const d of DIAG) delete a.dirs[d];
    const four = M.bookm.createBook(man4);
    /* the facing the hero is DRAWN in, read back off the compose list by its frame */
    const drawn = (book, hero) => {
      const b = M.nullb.createNullBackend({ book, tables: M.tables, view: { w: 60 * T, h: 40 * T } });
      b.mount(); b.setMap(town); b.sync({ name: 'Tyler', t: 0, hero: Object.assign({}, hero, { x: 11, y: 9, anim: 'walk', age: 0 }) });
      const d = b.snapshot().last.sprites.find((s) => s.id === HERO);
      return ['n', 'e', 's', 'w'].concat(DIAG).find((f) => { const want = book.frame(HERO, 'walk', f, 0); return book.sprites[HERO].anims.walk.dirs[f] && want.sx === d.sx && want.sy === d.sy; });
    };
    ok('D', M.facing.diagonalOf(1, 1) === 'se' && M.facing.diagonalOf(-1, -1) === 'nw' && M.facing.diagonalOf(2, -1) === 'ne' && M.facing.diagonalOf(3, 1) === null && M.facing.diagonalOf(0, 1) === null,
      'diagonalOf must name the diagonal of a diagonal heading and nothing for one nearer an axis');
    ok('D', drawn(eight, { dir: 's', diag: 'se' }) === 'se' && drawn(eight, { dir: 'w', diag: 'nw' }) === 'nw', 'with diagonal art, a diagonal step must DRAW its diagonal: ' + drawn(eight, { dir: 's', diag: 'se' }));
    ok('D', drawn(four, { dir: 's', diag: 'se' }) === 's' && drawn(four, { dir: 'e', diag: 'ne' }) === 'e',
      'with four facings, a diagonal step must draw the cardinal facingFor chose (s, e), got ' + drawn(four, { dir: 's', diag: 'se' }) + ', ' + drawn(four, { dir: 'e', diag: 'ne' }));
    ok('D', drawn(four, { dir: 'nw' }) === 'n', 'a diagonal asked for with no art must fall back to its nearest cardinal, got ' + drawn(four, { dir: 'nw' }));
    ok('D', drawn(M.book, { dir: 's', diag: 'se' }) === 'se', 'the shipped hero outfit walks its diagonals, got ' + drawn(M.book, { dir: 's', diag: 'se' }));
    /* the feet: a held diagonal steps with its diagonal; a straight step clears it */
    const st = M.steer.createSteer(town, [11, 9]);
    let t = 1e12;
    st.drive([1, 1], t);
    const a = st.step(t + 50);
    ok('D', a.moving && a.diag === 'se' && a.dir === M.steer.facingFor(1, 1, [1, 1], 's'), 'a held Down+Right step must carry diag se and facingFor\'s cardinal: ' + JSON.stringify(a));
    st.drive([1, 0], t + 100);
    const b = st.step(t + 5000);
    ok('D', b.diag === null && b.dir === 'e', 'a straight step must clear the diagonal: ' + JSON.stringify(b));
    /* end to end: a walk scene over the eight-facing art draws se on that step */
    const ws = M.walk.createWalkScene(town, { at: [11, 9], sprites: eight.sprites, openClasses: M.terrain.OPEN_CLASSES, maps: M.rows });
    ws.frame(ENV(), t);
    ws.drive([1, 1], t);
    const f = ws.frame(ENV(), t + 60);
    ok('D', f.hero.diag === 'se' && drawn(eight, f.hero) === 'se', 'a walk scene must hand the diagonal to the draw: ' + JSON.stringify(f.hero));
    ok('D', drawn(four, f.hero) === f.hero.dir, 'the same frame over four-facing art must draw ' + f.hero.dir);
    /* the hunt: the hero facing its foe on a diagonal carries that diagonal (monsters stay east/west: H8) */
    const cellar = M.mapc.compileMap(M.rows.mill_cellar, M.tables);
    let diagonals = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const ch = M.choreo.createChoreo(cellar, { seed, spawns: [{ monster: 'rat', w: 1 }] });
      let at = t;
      ch.sync({ foe: 'rat', tickMs: 3000, down: false }, at);
      /* kill after kill: the hero walks its loop and each next rat walks in from where it stood — the diagonals */
      for (let k = 0; k < 8; k++) {
        at += 3000;
        ch.beat({ foe: 'rat', killed: true, next: 'rat', tickMs: 3000, foeDmg: 5, heroDmg: 0 }, at);
        for (let dt = 100; dt < 3000; dt += 200) {
          const h = ch.frame(at + dt);
          if (!h.foe) continue;
          const dx = h.foe.x - h.hero.x, dy = h.foe.y - h.hero.y;
          ok('D', h.hero.diag === M.facing.diagonalOf(dx, dy) && h.hero.dir === M.choreo.dirOf(dx, dy),
            'the hunt hero must carry the diagonal toward its foe beside dirOf\'s cardinal: ' + JSON.stringify([h.hero, [h.foe.x, h.foe.y]]));
          if (h.hero.diag) diagonals++;
        }
      }
    }
    ok('D', diagonals > 0, 'no hunt staging put the foe on the hero\'s diagonal, so the hunt half of the facing rule went untested');
  });
  return fails;
}

const COPY = ['src/world', 'src/data/world', 'src/data/hunts.js', 'src/data/hunt-outfits.js', 'src/data/town-presence.js', 'src/data/perks.js', 'src/build-info.js', 'assets/world', 'src/session'];
function copyTree() {
  const dir = mkdtempSync(join(tmpdir(), 'world-town-home-'));
  for (const p of COPY) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    cpSync(join(ROOT, p), join(dir, p), { recursive: true, filter: (src) => !src.endsWith('.png') });
  }
  return dir;
}
function plantIn(dir, rel, edits) {
  const f = join(dir, rel);
  let s = readFileSync(f, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  for (const [from, to] of edits) {
    const a = from.replace(/\n/g, eol);
    if (!s.includes(a)) throw new Error('mutant anchor not found in ' + rel + ': ' + from);
    s = s.replace(a, to.replace(/\n/g, eol));
  }
  writeFileSync(f, s);
}

/* [family that must go red, the defect, file, [[anchor, replacement], …]] */
const MUTANTS = [
  ['R', 'the roof lifts for the first unit inside', 'src/world/core/compose.js', [['const heroId = heroBuilding(map.buildings, hero);', 'const heroId = heroBuilding(map.buildings, (state.units || []).find((u) => heroBuilding(map.buildings, u)) || hero);']]],
  ['R', 'a walker drawn where the server put it, hedge or not', 'src/world/town-scene.js', [['const at = standOn(map, [w.x, w.y]);', 'const at = [w.x, w.y];']]],
  ['C', 'the overlap grid blind to trees and props', 'src/world/core/map-compile.js', [["    if (!s || s.layer === 'decal') continue;\n    const air", "    if (!s || s.layer !== 'decal') continue;\n    const air"]]],
  ['P', 'the position written onto G', 'src/world/store.js', [['export function notePos(G, map, x, y) {', 'export function notePos(G, map, x, y) {\n  G.pos = { map, x, y };']]],
  ['T', 'every answer re-places the peer on the server\'s tile (a jump)', 'src/world/town-scene.js', [['else aim(p, w, now);', 'else p = null;']]],
  ['T', 'a peer never walks: it stands on each answer\'s tile', 'src/world/town-scene.js', [["if (!p.goal || p.goal[0] !== goal[0] || p.goal[1] !== goal[1]) { p.goal = goal; p.steer.walkTo(goal, now, false); }", 'p.goal = goal;']]],
  ['T', 'a re-aim restarts the walk clip', 'src/world/town-scene.js', [['const { anim, age } = walkClip(o.sprites[id], at, p.steer.restMs(now), pickFacing);', "const { anim } = walkClip(o.sprites[id], at, p.steer.restMs(now), pickFacing); const age = p.steer.restMs(now);"]]],
  ['T', 'a walker the server stopped naming stays', 'src/world/town-scene.js', [['if (!live.has(id)) people.delete(id);', 'void live;']]],
  ['T', 'peers wear one outfit', 'src/world/town-scene.js', [['const id = outfitSprite(p.w.outfit, p.w.role);', "const id = outfitSprite(null, 'tank');"]]],
  ['T', 'a peer ignores the outfit its character chose', 'src/world/town-scene.js', [['const id = outfitSprite(p.w.outfit, p.w.role);', 'const id = outfitSprite(null, p.w.role);']]],
  ['T', 'a peer is not stamped for the player menu', 'src/world/town-scene.js', [['ref: { player: { id: p.w.id, name: p.w.name, slot: p.w.slot } },', 'ref: null,']]],
  ['F', 'furniture merged across envelopes', 'src/world/home-scene.js', [['export function furnish(mapId, rooms, trophies, nameOf) {', 'const KEPT = new Map();\nexport function furnish(mapId, rooms, trophies, nameOf) {\n  const out0 = furnish0(mapId, rooms, trophies, nameOf);\n  for (const p of out0) if (p.ref && p.ref.room) KEPT.set(p.id + p.x + "," + p.y, p);\n  return out0.filter((p) => !(p.ref && p.ref.room)).concat([...KEPT.values()]);\n}\nfunction furnish0(mapId, rooms, trophies, nameOf) {']]],
  ['F', 'a room with a rung missing from its layout', 'src/data/world/house-layouts.js', [[", [p('basket', 6, 3)]]),", ']),']]],
  ['H', 'the hatch also moves the hero', 'src/world/steer-local.js', [["if (act.kind === 'hunt') return nav.hunt(act.hunt);", "if (act.kind === 'hunt') { nav.walk([0, 0]); return nav.hunt(act.hunt); }"]]],
  ['H', 'the hatch starts the hunt', 'src/world/world-boot.js', [["    hunt: (id) => emit('entrance', { hunt: id }),", "    hunt: (id) => { win.startHunt(id); return emit('entrance', { hunt: id }); },"]]],
  ['S', 'a corner-cutting walk', 'src/world/core/path.js', [['if (dx && dy) return walkable', 'if (false) return walkable']]],
  ['S', 'the hero walks to its station on its own again', 'src/world/walk-scene.js', [['      const at = steer.step(now);', '      if (steer.restMs(now) >= 3000) steer.walkTo(map.stations.combat || map.start, now, false);\n      const at = steer.step(now);']]],
  ['S', 'a station tap opens it but never walks there', 'src/world/walk-scene.js', [["      else if (act.kind === 'skill') steer.walkTo(pick.tile, now, true);", '']]],
  ['S', 'a hunt ends where the hero stood before it', 'src/world/world-boot.js', [['walk = null; lastWalk = null; keys.clear(); forgetPos(G);', 'walk = null; lastWalk = null; keys.clear();']]],
  ['S', 'forgetPos forgets nothing', 'src/world/store.js', [['  delete worldOf(G).pos;', '  void worldOf(G);']]],
  ['K', 'a held key takes one step and stops', 'src/world/steer-local.js', [['const next = legs.shift() || heldStep(fx, fy);', 'const next = legs.shift() || (leg ? null : heldStep(fx, fy));']]],
  ['K', 'a held diagonal cuts the wall corner', 'src/world/steer-local.js', [['if (canStep(m, w, h, fx, fy, sx, sy)) return', 'if (walkable(m, w, h, fx + sx, fy + sy)) return']]],
  ['K', 'a second key pressed a moment late is ignored until the next tile', 'src/world/steer-local.js', [['if (leg) reAim(now);', 'if (leg) void now;']]],
  ['K', 'letting go does not stop the hero', 'src/world/steer-local.js', [['if (!dx && !dy) { held = null; return; }', 'if (!dx && !dy) return;']]],
  ['M', 'a diagonal step faces by its own sign (b585)', 'src/world/steer-local.js', [['dir = facingFor(next[0] - fx, next[1] - fy, trip, dir);', "dir = Math.abs(next[0] - fx) >= Math.abs(next[1] - fy) ? (next[0] > fx ? 'e' : 'w') : (next[1] > fy ? 's' : 'n');"]]],
  ['M', 'the camera led by the fractional position (b585)', 'src/world/walk-scene.js', [['const hx = onPixel(at.x), hy = onPixel(at.y);', 'const hx = at.x, hy = at.y;']]],
  ['M', 'the walk clip played by the wall clock (b585)', 'src/world/steer-local.js', [["return { anim: 'walk', age: ((at.walked / WALK_CYCLE_TILES) * n * 1000) / fps };", "return { anim: 'walk' };"]]],
  ['D', 'the draw ignores the diagonal (four facings forever)', 'src/world/core/compose.js', [["const dir = book.facing(u.id, anim, u.dir || 's', u.diag);", "const dir = u.dir || 's';"]]],
  ['D', 'a diagonal step forgets its diagonal', 'src/world/steer-local.js', [['diag = diagonalOf(next[0] - fx, next[1] - fy);', 'diag = null;']]],
  ['D', 'a missing diagonal falls to its east/west half, not to facingFor\'s cardinal', 'src/world/core/facing.js', [['if (diag && dirs[diag]) return diag;', 'if (diag) return dirs[diag] ? diag : diag[1];']]],
  ['D', 'the walk scene drops the diagonal', 'src/world/walk-scene.js', [['dir: at.dir, diag: at.diag,', 'dir: at.dir,']]],
  ['D', 'the hunt hero carries no diagonal', 'src/world/choreo.js', [['diag: diagonalOf(head[0], head[1]) }', 'diag: null }']]],
];

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
      if (f.some((x) => x.id === id || x.id === id + '!')) console.log('  ✓ ' + id + ' caught: ' + why);
      else { console.log('  ✗ ' + id + ' NOT CAUGHT: ' + why + (f.length ? ' (red elsewhere: ' + [...new Set(f.map((x) => x.id))].join(',') + ')' : '')); bad++; }
    } catch (e) {
      console.log('  ✗ ' + id + ' could not be planted or crashed the guard: ' + e.message); bad++;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (bad) { console.error('world-town-home --selftest FAILED — ' + bad + ' unproven'); process.exit(1); }
  console.log('world-town-home --selftest PASSED — clean control green, ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught by their own family.');
}

if (process.argv.includes('--selftest')) await selftest();
else {
  const fails = check(await load(ROOT));
  if (fails.length) {
    for (const f of fails) console.error('  ✗ ' + f.id + '  ' + f.msg);
    console.error('world-town-home: ' + fails.length + ' failure(s)');
    process.exit(1);
  }
  console.log('world-town-home: green — roofs, nothing saved, peers walking where the server says, furniture replaced, the hatch only navigates, steering, the keys, smooth walking, eight facings');
}
