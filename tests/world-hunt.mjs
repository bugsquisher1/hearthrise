#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/world-hunt.mjs — THE HUNT SCENE STAGES THE FIGHT AND CLAIMS NOTHING
//
//   node tests/world-hunt.mjs             the guard
//   node tests/world-hunt.mjs --selftest  every planted defect must be caught
//
// The World pane's hunt (src/world/{choreo,hunt-scene,hunt-chrome}.js) is fed
// by beats (src/world/beat.js: one per swing, a fight diff). These run the REAL
// engine's attended tick (src/core/hunt/world-step.js stepSwing, the same code
// the live tick calls) against the Mill Cellar map and assert the plan's
// choreography and fences (world-slice-plan §2):
//   H1 ATTENDED: at every swing, for tickMs 600..3600, the shown foe IS
//      G.activeMonster and stands on a tile next to the hero — a training rat
//      and the cellar hunt rolling rat/slime/wasp alike
//   H2 KNOCKOUT: an envelope fight {slime, hp 3, kills 2} with a future
//      recovering_until puts the hero down with zero floats, also when a swing
//      is reported; a fall the server has not priced shows a pending mark and
//      no clock
//   H3 FOE SWAP: a foe the server swaps breaks off — it walks away fading,
//      leaves no corpse and plays no death; a kill is read off the fight's own
//      counter (state.fight's kills) or a foe change, never off G.stats
//   H4 NO ITEM NAME: kills that dropped real items leave a generic loot bag;
//      no dropped item's name is anywhere in the scene or the overlay
//   H5 ANALYZER: the overlay's numbers are the settled Analyzer's, printed as
//      sent, labelled "settled N s ago"; nothing settled is em-dashes, not 0
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
  const [sim, rng, obs, scene, chrome, camera, mapc, maps, terrain, hunts, monsters, items, sets, bookm] = await Promise.all([
    'src/core/combat-sim.js', 'src/core/rng.js', 'src/world/beat.js', 'src/world/hunt-scene.js', 'src/world/hunt-chrome.js',
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
  return { sim, rng, obs, scene, chrome, camera, map: mapc.compileMap(row, tables), row, hunts, MON: monsters.MONSTERS, ITEMS: items.ITEMS,
    sources: { beat: src('src/world/beat.js'), choreo: src('src/world/choreo.js'), scene: src('src/world/hunt-scene.js'), chrome: src('src/world/hunt-chrome.js') } };
}

/** A real attended fight: the engine's own tick, diffed into beats. */
function fight(M, o) {
  const G = { activeMonster: o.foe, monsterHp: M.MON[o.foe].hp, monsterMaxHp: M.MON[o.foe].hp, playerHp: 1e6, playerMaxHp: 1e6,
    combatKillsThisFoe: 0, stats: {}, gold: 0, inventory: {} };
  const drops = [];
  const ctx = {
    rng: M.rng.createRng('world-hunt:' + o.seed), monsters: M.MON,
    playerRolls: () => ({ accuracy: 0.8, maxHit: 5, critChance: 0.1 }), monsterRolls: () => ({ accuracy: 0.5, maxHit: 2 }),
    weakness: () => ({ dropMult: 1 }), bonus: () => 0, hunt: o.hunt || null,
    fx: { onDrop: (ev) => drops.push(ev) },
  };
  const tick = () => {
    const b = M.obs.fightOf(G);
    M.sim.stepSwing(null, Object.assign({}, ctx, { state: G }));
    return M.obs.beatOf(b, M.obs.fightOf(G), { at: 0, tickMs: o.tickMs, crit: !!G._lastPlayerCrit, wasDown: false, downAfter: false });
  };
  return { G, drops, tick };
}
const snapOf = (M, G, tickMs, down) => Object.assign(M.obs.fightOf(G), { tickMs, down: down || null });
const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const nameOf = (M) => (id) => (M.MON[id] && M.MON[id].name) || id;

function check(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push({ id, msg }); };
  const huntRow = M.hunts.HUNT_INDEX.mill_cellar;
  const newScene = (extra) => M.scene.createHuntScene(M.map, Object.assign({ huntId: 'mill_cellar', since: 'x', spawns: huntRow.spawns, nameOf: nameOf(M) }, extra));

  // H1 — adjacency at every swing, the target is the engine's foe.
  for (const tickMs of [600, 900, 1200, 1300, 1800, 2400, 3000, 3600]) {
    for (const mode of ['training', 'hunt']) {
      const f = fight(M, { foe: 'rat', tickMs, seed: tickMs + mode, hunt: mode === 'hunt' ? { spawns: huntRow.spawns } : null });
      const sc = newScene();
      let t = 1000, kills = 0, swaps = 0, bad = null;
      for (let i = 0; i < 160 && !bad; i++) {
        const st = sc.state(snapOf(M, f.G, tickMs), t, 'Tyler');
        const foeU = st.units.find((u) => u.target);
        if (st.foe !== f.G.activeMonster) bad = 'swing ' + i + ': shown foe ' + st.foe + ' but the engine fights ' + f.G.activeMonster;
        else if (!foeU || !near(st.hero, foeU)) bad = 'swing ' + i + ': the foe is not next to the hero (' + JSON.stringify(foeU && [foeU.x, foeU.y]) + ' vs ' + JSON.stringify([st.hero.x, st.hero.y]) + ')';
        const before = f.G.activeMonster;
        const b = f.tick();
        if (b) { b.at = t; sc.beat(b); if (b.killed) kills++; if (f.G.activeMonster !== before) swaps++; }
        /* a frame mid-approach, so the approach itself is drawn at least once */
        sc.state(snapOf(M, f.G, tickMs), t + tickMs / 2, 'Tyler');
        t += tickMs;
      }
      ok('H1', !bad, 'ATTENDED ' + mode + ' at tickMs ' + tickMs + ': ' + bad);
      ok('H1', kills >= 10, 'ATTENDED ' + mode + ' at tickMs ' + tickMs + ' killed only ' + kills + ' times; the fixture must exercise many kills');
      if (mode === 'hunt') ok('H1', swaps >= 2, 'the hunt fixture never rolled a different foe (' + swaps + ')');
    }
  }

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
    const m = M.chrome.hudModel({ analyzer: null, title: 'Mill Cellar', down: { phase: 'recovering', until }, now: t });
    ok('H2', m.status && m.status.kind === 'down' && /1:30/.test(m.status.text), 'the knockout line must count down the SERVER\'s recovering_until (' + JSON.stringify(m.status) + ')');
    const p = M.chrome.hudModel({ analyzer: null, title: 'Mill Cellar', down: { phase: 'pending', until: 0 }, now: t });
    ok('H2', p.status && p.status.kind === 'pending' && !/\d/.test(p.status.text) && /whud-pending/.test(M.chrome.hudHtml(p)), 'an unpriced fall shows a pending mark, never a guessed clock (' + JSON.stringify(p.status) + ')');
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

  // H4 — loot bags, no item names.
  {
    const f = fight(M, { foe: 'rat', tickMs: 2400, seed: 'loot' });
    const itemName = (id) => (M.ITEMS[id] && (M.ITEMS[id].name || M.ITEMS[id].n)) || null;
    const sc = newScene({ itemOf: () => itemName(f.drops.length ? f.drops[f.drops.length - 1].id : 'rat_tail') });
    let t = 1000, bagSeen = false;
    const texts = [];
    for (let i = 0; i < 60; i++) {
      const b = f.tick();
      if (b) { b.at = t; sc.beat(b); }
      const st = sc.state(snapOf(M, f.G, 2400), t + 50, 'Tyler');
      if (st.units.some((u) => u.id === 'loot_bag')) bagSeen = true;
      for (const u of st.units.concat([st.hero])) if (u.plate) texts.push(u.plate.text);
      for (const fl of st.floats) texts.push(fl.text);
      t += 2400;
    }
    const hud = M.chrome.hudHtml(M.chrome.hudModel({ analyzer: { kills: 3, xp_per_h: 10, loot_value: 5, profit_per_h: 1, settled_at: new Date(t).toISOString() }, title: 'Mill Cellar', down: null, now: t }));
    const names = [...new Set(f.drops.map((d) => itemName(d.id)).filter(Boolean))];
    ok('H4', names.length >= 2, 'the fixture must actually drop items (' + names.join(', ') + ')');
    ok('H4', bagSeen, 'a kill must leave a generic loot bag');
    const leak = names.filter((n) => texts.some((x) => x.includes(n)) || hud.includes(n));
    ok('H4', !leak.length, 'an item was named before its settled receipt: ' + leak.join(', '));
  }

  // H9 — the loot bag lands beside the body, never on it (a bag on a corpse vanishes into it).
  for (const tickMs of [900, 2400]) {
    const f = fight(M, { foe: 'rat', tickMs, seed: 'bag' + tickMs, hunt: { spawns: huntRow.spawns } });
    const sc = newScene();
    let t = 1000, kills = 0, bad = null;
    for (let i = 0; i < 80 && !bad; i++) {
      const b = f.tick();
      if (!b) { t += tickMs; continue; }
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

  // H5 — the overlay prints the settled Analyzer, never its own count.
  {
    const now = Date.parse('2026-10-14T12:00:00Z');
    const m = M.chrome.hudModel({ analyzer: { kills: 41, xp_per_h: 1180, loot_value: 96, profit_per_h: 212, settled_at: '2026-10-14T11:59:48Z' }, title: 'Mill Cellar', down: null, now });
    const rows = Object.fromEntries(m.analyzer.rows);
    ok('H5', rows.Kills === '41' && rows['XP / hour'] === '1,180' && rows['Loot value'] === '96 gp' && rows['Profit / hour'] === '+212 gp', 'the Analyzer rows must be the server\'s numbers as sent: ' + JSON.stringify(rows));
    ok('H5', m.analyzer.honesty === 'settled 12 s ago', 'the honesty line must say how long ago it settled: ' + m.analyzer.honesty);
    const e = M.chrome.hudModel({ analyzer: null, title: 'Mill Cellar', down: null, now });
    ok('H5', e.analyzer.rows.every(([, v]) => v === '—') && e.analyzer.honesty === 'nothing settled yet', 'nothing settled is em-dashes, never zeroes: ' + JSON.stringify(e.analyzer));
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

  // H8 — monsters face a side, never the camera: a rat's head-on frame reads as a spider at 48 px.
  //      Over a real hunt fight (bystanders wandering, the foe engaging, the fallen and the leaving).
  {
    const f = fight(M, { foe: 'rat', tickMs: 1200, seed: 'h8', hunt: { spawns: huntRow.spawns } });
    const sc = newScene();
    let units = 0, facing = 0, moving = 0;
    const sides = new Set();
    for (let i = 0, t = 1000; i < 120; i++, t += 1200) {
      for (const dt of [0, 300, 600, 900]) {
        for (const u of sc.state(snapOf(M, f.G, 1200), t + dt, 'Tyler').units) {
          if (u.id === 'loot_bag') continue;
          units++; sides.add(u.dir);
          if (u.anim === 'walk') moving++;
          if (u.dir !== 'e' && u.dir !== 'w') facing++;
        }
      }
      const b = f.tick();
      if (b) { b.at = t; sc.beat(b); }
    }
    ok('H8', units > 500 && moving > 20 && facing === 0, facing + ' of ' + units + ' monster frames (' + moving + ' walking) face the camera or away');
    ok('H8', sides.has('e') && sides.has('w'), 'the monsters all face one way: ' + [...sides].join(','));
  }
  return fails;
}

const COPY = ['src/world', 'src/data', 'src/core', 'src/build-info.js', 'assets/world'];
const MUTANTS = [
  ['H1', 'the approach outlasts the swing', 'src/world/choreo.js', [['const reach = Math.max(0, tickMs - WINDUP_MS);', 'const reach = tickMs * 3;'], ['export const STEP_MS = 320;', 'export const STEP_MS = 2000;']]],
  ['H2', 'floats drawn while knocked out', 'src/world/choreo.js', [['floats: down ? [] : floats.map(', 'floats: floats.map('], ['const quiet = down || b.downAfter;', 'const quiet = false;']]],
  ['H3', 'a swap kills the shown foe', 'src/world/choreo.js', [['else if (foe.id !== f.foe) { breakOff(t);', 'else if (foe.id !== f.foe) { kill({ tickMs: 0, next: null }, t);']]],
  ['H3', 'kills read off the G.stats residue', 'src/world/beat.js', [['kills: n(g.combatKillsThisFoe),', 'kills: n(g.stats && g.stats.kills),']]],
  ['H4', 'the bag names its item', 'src/world/hunt-scene.js', [["units.push({ id: 'loot_bag',", "units.push({ plate: { text: o.itemOf ? o.itemOf() : '', kind: 'ambient' }, id: 'loot_bag',"]]],
  ['H9', 'the bag lands on the corpse', 'src/world/choreo.js', [['const spot = bagSpot(at);', 'const spot = at;']]],
  ['H5', 'nothing settled reads as zero', 'src/world/hunt-chrome.js', [['const num = (v) => (v != null && Number.isFinite(Number(v))', 'const num = (v) => (Number.isFinite(Number(v))']]],
  ['H6', 'a room that fits is pinned to its corner, not centred', 'src/world/core/camera.js', [['if (span <= u) c = lo + (span - u) / 2;', 'if (span <= u) c = lo;']]],
  ['H6', 'a big room scrolls past its walls into the void', 'src/world/core/camera.js', [['    c = Math.min(hi - u, Math.max(lo, c));\n', '']]],
  ['H8', 'a standing bystander faces the camera', 'src/world/choreo.js', [["const rest = (a) => (hash32('f' + a.slot) & 1 ? 'e' : 'w');", "const rest = () => 's';"]]],
  ['H8', 'a monster turns to the camera on a vertical step', 'src/world/choreo.js', [["const sideOf = (dx, keep) => (dx > 0 ? 'e' : dx < 0 ? 'w' : keep);", "const sideOf = (dx, keep) => (dx > 0 ? 'e' : dx < 0 ? 'w' : 's');"]]],
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
  console.log('world-hunt: green — attended adjacency at tickMs 600..3600, knockout, foe swap, no item names, settled Analyzer, room camera, one engine, side-on monsters, bags beside the body');
}
