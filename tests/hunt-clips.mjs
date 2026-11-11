#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-clips.mjs — THE ANIMATION HOOK: A CLIP PLAYS ONLY ON ITS EVENT, AND ONLY ON A FACING IT HAS.
//
//   node tests/hunt-clips.mjs           the rules
//   node tests/hunt-clips.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/hunt-view/clip-hook.js src/world/core/facing.js src/hunt-view/scene.js
// mutant-writes-tree: no — mutants are planted into a temp copy of src/
//
// The REAL timeline (src/hunt-view/timeline.js), scene (scene.js) and hook (clip-hook.js) over the SHIPPED atlas
// manifests, driven by hand-made server batches (CLAUDE.md §1: the client only shows what the timeline says happened):
//   HC-1  THE FACING RULE (core/facing.js clipFacing), over every shipped sprite's swing, flinch and fall and every one of
//         the eight facings: the answer is the unit's own facing when the clip has it, else a facing the clip HAS no more
//         than `reach` 45° steps round, else none. Never the south clip for a missing north, never a facing the clip lacks.
//   HC-2  NO CLIP ON A FACING THE SPRITE LACKS: every unit drawn in a one-shot clip at every instant of a fight draws a facing
//         that clip has, exactly (no book fallback reached); the rat facing north (no flinch drawn there or one step round)
//         gives the 1 art px recoil instead, and the rat king facing south (its swing is owed there) swings in a drawn neighbour.
//   HC-3  NO CLIP WITHOUT ITS EVENT: with no events nobody swings, flinches or falls; a blow's swing shows its `hit` frame at
//         the blow's own instant, winds up only while the blow is queued, and ends with its frames; a blow a rebase drops
//         takes its wind-up with it; a status tick and a heal on a friend move nobody, a follow-through swings nobody; a
//         fall starts at its kill, never before, and lies as its corpse in a facing the fall has.
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];

async function load(base) {
  const u = (p) => import(pathToFileURL(join(base, p)).href + V);
  const M = {
    T: await u('src/hunt-view/timeline.js'), S: await u('src/hunt-view/scene.js'), H: await u('src/hunt-view/clip-hook.js'),
    F: await u('src/world/core/facing.js'), B: await u('src/world/core/book.js'), SETS: await u('src/data/world/atlas-sets.js'),
  };
  const manifests = {};
  for (const set of M.SETS.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  M.manifests = manifests;
  M.book = M.B.createBook(manifests);
  return M;
}

const S0 = 5000000;   // server clock; the client clock is the same number (offset 0, no playback delay)
const RING = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
const steps = (a, b) => { const d = Math.abs(RING.indexOf(a) - RING.indexOf(b)); return Math.min(d, 8 - d); };
const drawn = (u) => u.diag || u.dir;

/* One fight: the knight (unit 1) and the monsters `mons` ({ u, kind, x, y, from?: [x, y] }), the batch's events, and a scene. */
function fight(M, mons, events) {
  const tl = M.T.createTimeline({ delayMs: 0, tileMs: 312 });
  const track = [{ u: 1, x: 10, y: 10, atMs: S0 - 9000 }];
  for (const m of mons) {
    if (m.from) track.push({ u: m.u, x: m.from[0], y: m.from[1], atMs: S0 - 9000 });
    track.push({ u: m.u, x: m.x, y: m.y, atMs: S0 - 8000 });
  }
  const units = { 1: ['knight', 200, 200] };
  for (const m of mons) units[m.u] = [m.kind, 50, 50];
  tl.ingest({ serverNowMs: S0 - 9000, fromMs: S0 - 9000, units, track, events: events.map((e, i) => Object.assign({ id: 'e' + i }, e)) }, S0 - 9000);
  const read = () => ({
    units: new Map(mons.map((m) => [m.u, { kind: m.kind, side: 'monster', hp: 50, hpMax: 50, alive: true }])),
    heroes: new Map([[1, { name: 'Brannoc', role: 'tank', seat: 0, outfit: 'knight', look: 'outfit_knight', hp: 200, hpMax: 200 }]]),
    people: new Map(), viewed: 1, viewedShield: 0, poseAtMs: null, entrance: null, huntName: null, huntFromMs: null,
    self: null, look: 'outfit_knight', dye: null, level: null, title: null, shown: () => true,
  });
  const scene = M.S.createHuntScene({ timeline: tl, book: M.book, read });
  tl.subscribe((ev) => scene.onEvent(ev, S0));
  return { tl, scene, at(now) { tl.advance(now); const f = scene.frame(now); return [f.hero, ...f.units].filter(Boolean); } };
}
const unit = (list, u) => list.find((d) => d.unit === u);
const SHOTS = ['attack', 'hit', 'death', 'corpse'];

async function rules(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ': ' + msg); };

  { // HC-1: the pure rule over every shipped clip
    let n = 0, bad = null;
    for (const [id, s] of Object.entries(M.book.sprites)) {
      for (const name of ['attack', 'hit', 'death']) {
        const c = s.anims && s.anims[name];
        if (!c) continue;
        for (const want of RING) for (const reach of [0, 1, 4]) for (const [hx, hy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
          const dir = want.length === 2 ? want[0] : want, diag = want.length === 2 ? want : null;
          const f = M.F.clipFacing(c.dirs, dir, diag, reach, hx, hy);
          n++;
          if (c.dirs[want] && f !== want) bad = bad || [id, name, want, reach, f, 'its own facing'];
          else if (f !== null && (!c.dirs[f] || steps(f, want) > reach)) bad = bad || [id, name, want, reach, f, 'a facing it lacks or too far'];
          else if (f === null && reach >= 4) bad = bad || [id, name, want, reach, f, 'none at all'];
        }
      }
    }
    ok('HC-1', n > 1000 && !bad, 'the facing rule broke on ' + JSON.stringify(bad) + ' (' + n + ' cases)');
    const ratHit = M.book.sprite('rat').anims.hit;
    ok('HC-1', ratHit && !ratHit.dirs.n && M.F.clipFacing(ratHit.dirs, 'n', null, M.H.CLIP_RULES.reach, 0, -1) === null,
      'the rat facing north has no flinch within reach: the rule must answer none, never its south clip');
    ok('HC-1', M.F.clipFacing({ s: [1], e: [1] }, 's', 'se', 1, 1, 0.9) === 'e' && M.F.clipFacing({ s: [1], e: [1] }, 's', 'se', 1, 0.9, 1) === 's',
      'a diagonal between two drawn facings takes the one nearer its heading');
  }

  { // HC-2: a whole fight, every instant: a one-shot only on a facing its clip has
    const mons = [
      { u: 101, kind: 'rat', x: 11, y: 10, from: [11, 11] },        // walked north onto its tile: faces north
      { u: 102, kind: 'rat_king', x: 10, y: 9 },                     // north of the knight: swings south at it
      { u: 103, kind: 'slime', x: 9, y: 10 },                        // west of the knight
    ];
    const ev = [
      { type: 'dmg', atMs: S0 + 1000, u: 1, t: 101, amount: 6, ability: 'basic', element: null },
      { type: 'dmg', atMs: S0 + 1500, u: 102, t: 1, amount: 9, ability: 'basic', element: null },
      { type: 'dmg', atMs: S0 + 2000, u: 103, t: 1, amount: 4, ability: 'basic', element: null },
      { type: 'dmg', atMs: S0 + 2500, u: 1, t: 103, amount: 7, ability: 'basic', element: null },
      { type: 'kill', atMs: S0 + 3000, u: 1, t: 103 },
      { type: 'dmg', atMs: S0 + 3500, u: 1, t: 102, amount: 7, ability: 'basic', element: null },
      { type: 'kill', atMs: S0 + 4000, u: 1, t: 102 },
    ];
    const f = fight(M, mons, ev);
    let bad = null, recoiled = false, ratHit = false, kingSwing = null;
    for (let now = S0 + 500; now <= S0 + 7000 && !bad; now += 7) {
      for (const d of f.at(now)) {
        if (d.unit === 101 && d.anim === 'hit') ratHit = true;
        if (d.unit === 101 && d.recoil) recoiled = true;
        if (d.unit === 102 && d.anim === 'attack') kingSwing = drawn(d);
        if (!SHOTS.includes(d.anim)) continue;
        const dirs = M.book.sprite(d.id).anims[d.anim].dirs;
        if (!dirs[drawn(d)]) bad = { now, unit: d.unit, id: d.id, anim: d.anim, facing: drawn(d), has: Object.keys(dirs) };
      }
    }
    ok('HC-2', !bad, 'a one-shot drew a facing its clip does not have: ' + JSON.stringify(bad));
    ok('HC-2', !ratHit && recoiled, 'the rat facing north must recoil, never flinch in a clip it lacks: ' + JSON.stringify({ ratHit, recoiled }));
    ok('HC-2', kingSwing === 'se' || kingSwing === 'sw', 'the rat king swinging south swings in a drawn neighbour (its south is owed), got ' + kingSwing);
  }

  { // HC-3: the timeline drives every clip
    const quiet = fight(M, [{ u: 101, kind: 'rat', x: 11, y: 10 }], []);
    let moved = null;
    for (let now = S0; now <= S0 + 3000 && !moved; now += 16) for (const d of quiet.at(now)) if (SHOTS.includes(d.anim) || d.recoil) moved = [now, d.unit, d.anim];
    ok('HC-3', !moved, 'nobody may swing, flinch or fall with no event: ' + JSON.stringify(moved));

    const T = S0 + 2000;
    const blow = { type: 'dmg', atMs: T, u: 101, t: 1, amount: 9, ability: 'basic', element: null };
    const atk = M.book.sprite('rat').anims.attack, lead = (atk.hit * 1000) / atk.fps, span = (M.book.frames('rat', 'attack', 'w') * 1000) / atk.fps;
    const f = fight(M, [{ u: 101, kind: 'rat', x: 11, y: 10 }], [blow]);
    const r = (now) => unit(f.at(now), 101), k = (now) => unit(f.at(now), 1);
    const before = r(T - lead - 5), first = r(T - lead + 5), onBlow = r(T + 1), done = r(T - lead + span + 5);
    ok('HC-3', before && before.anim !== 'attack', 'no swing before its wind-up: ' + JSON.stringify(before && before.anim));
    ok('HC-3', first && first.anim === 'attack' && first.frame === 0 && drawn(first) === 'w', 'the swing winds up from frame 0, toward the knight (west): ' + JSON.stringify(first && [first.anim, first.frame, drawn(first)]));
    ok('HC-3', onBlow && onBlow.anim === 'attack' && onBlow.frame === atk.hit, 'the swing shows its hit frame at the blow\'s own instant: ' + JSON.stringify(onBlow && [onBlow.anim, onBlow.frame, atk.hit]));
    ok('HC-3', done && done.anim !== 'attack', 'the swing ends with its frames: ' + JSON.stringify(done && done.anim));
    const knight = k(T + 1);
    ok('HC-3', knight && knight.anim === 'hit' && knight.frame === 0 && M.book.sprite('outfit_knight').anims.hit.dirs[drawn(knight)],
      'the knight flinches from the blow\'s instant in a facing its flinch has: ' + JSON.stringify(knight && [knight.anim, knight.frame, drawn(knight)]));

    const g = fight(M, [{ u: 101, kind: 'rat', x: 11, y: 10 }], [blow]);
    const wound = unit(g.at(T - 100), 101);
    g.tl.rebase(T - 150, new Map());
    const after = [T - 90, T + 1, T + 200].map((now) => unit(g.at(now), 101)), struck = unit(g.at(T + 50), 1);
    ok('HC-3', wound && wound.anim === 'attack' && after.every((d) => d && d.anim !== 'attack') && struck && struck.anim !== 'hit',
      'a blow a rebase drops takes its wind-up and its flinch with it: ' + JSON.stringify([wound && wound.anim, after.map((d) => d && d.anim), struck && struck.anim]));

    const noise = fight(M, [{ u: 101, kind: 'rat', x: 11, y: 10 }, { u: 102, kind: 'rat', x: 12, y: 10 }], [
      { type: 'dmg', atMs: T, u: 102, t: 101, amount: 3, ability: 'rend', element: null, dot: true },
      { type: 'cast', atMs: T + 1600, u: 101, t: 102, ability: 'rat_heal' },
    ]);
    let stirred = null;
    for (let now = T - 1000; now <= T + 2600 && !stirred; now += 10) {
      for (const d of noise.at(now)) if (d.unit !== 1 && (SHOTS.includes(d.anim) || d.recoil)) stirred = [now, d.unit, d.anim, !!d.recoil];
    }
    ok('HC-3', !stirred, 'a status tick and a cast on a friend move nobody: ' + JSON.stringify(stirred));
    /* a follow-through's second number lands on a second monster (it may flinch), but its dealer swung once */
    const foes = () => true;
    ok('HC-3', M.H.swingerOf({ type: 'dmg', u: 1, t: 102, amount: 4, follow: true }, foes) === null && M.H.swingerOf({ type: 'dmg', u: 1, t: 102, amount: 4, dot: true }, foes) === null
      && M.H.swingerOf({ type: 'dmg', u: 1, t: 102, amount: 4 }, foes) === 1 && M.H.struckBy({ type: 'dmg', t: 102, amount: 4, follow: true }) === 102,
      'a follow-through or a tick is no swing; a follow-through that lands is a blow on its target');

    const K = S0 + 1500;
    const death = fight(M, [{ u: 101, kind: 'rat', x: 11, y: 10 }], [{ type: 'kill', atMs: K, u: 1, t: 101 }]);
    const pre = unit(death.at(K - 10), 101), fell = unit(death.at(K + 10), 101), lay = unit(death.at(K + 5000), 101);
    const dclip = M.book.sprite('rat').anims;
    ok('HC-3', pre && pre.anim !== 'death' && fell && fell.anim === 'death' && fell.frame === 0 && dclip.death.dirs[drawn(fell)]
      && lay && lay.anim === 'corpse' && dclip.corpse.dirs[drawn(lay)] && drawn(lay) === drawn(fell),
      'a fall starts at its kill and lies as its corpse in a facing it has: ' + JSON.stringify([pre && pre.anim, fell && [fell.anim, fell.frame, drawn(fell)], lay && [lay.anim, drawn(lay)]]));
  }
  return fails;
}

const MUTANTS = [
  ['a missing facing falls back to the south clip (HC-1, HC-2)', 'src/world/core/facing.js', '  if (dirs[want]) return want;\n  const at = RING.indexOf(want);', '  if (dirs[want]) return want;\n  if (dirs.s) return \'s\';\n  const at = RING.indexOf(want);'],
  ['a clip may turn its unit any distance (HC-2)', 'src/hunt-view/clip-hook.js', '  reach: 1, ', '  reach: 4, '],
  ['the reach is not held (HC-1)', 'src/world/core/facing.js', 'for (let k = 1; k <= Math.min(4, reach); k++) {', 'for (let k = 1; k <= 4; k++) {'],
  ['a dropped blow keeps its wind-up (HC-3)', 'src/hunt-view/clip-hook.js', '    look(now) {\n      ahead = new Map();', '    look(now) {\n      ahead = ahead || new Map();'],
  ['a swing starts on its blow, not before it (HC-3)', 'src/hunt-view/clip-hook.js', 'const lead = Math.min(CLIP_RULES.leadCapMs, (hit * 1000) / c.fps);', 'const lead = 0;'],
  ['a status tick flinches (HC-3)', 'src/hunt-view/clip-hook.js', '&& ev.amount > 0 && !ev.dot ? ev.t : null;', '&& ev.amount > 0 ? ev.t : null;'],
  ['a cast on a friend swings (HC-3)', 'src/hunt-view/clip-hook.js', "if (ev.type === 'cast') return foes(ev.u, ev.t) ? ev.u : null;", "if (ev.type === 'cast') return ev.u;"],
  ['a swing counts its frames from the blow, not its wind-up (HC-3)', 'src/hunt-view/clip-hook.js', 'const i = Math.floor(((now - act.w.start) * act.w.fps) / 1000);', 'const i = Math.max(0, Math.floor(((now - act.at) * act.w.fps) / 1000));'],
  ['the wind-up is drawn from nothing queued (HC-3)', 'src/hunt-view/clip-hook.js', 'for (const ev of tl.upcoming(now, CLIP_RULES.leadCapMs)) {', 'for (const ev of [{ type: \'miss\', u: 101, t: 1, atMs: now + 100 }]) {'],
  ['the recoil is dropped where no flinch is drawn (HC-2)', 'src/hunt-view/clip-hook.js', 'return now - h.at < CLIP_RULES.recoilMs ? { recoil: [h.dx, h.dy] } : null;', 'return null;'],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(await load(ROOT));
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'hunt-clips: ' + fails.length + ' rule(s) RED' : 'hunt-clips: every clip on its event, every clip on a facing it has, the rule held over every shipped clip');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await rules(await load(ROOT));
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'hr-huntclips-'));
    try {
      cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true });
      const text = readFileSync(join(tmp, file), 'utf8');
      if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
      writeFileSync(join(tmp, file), text.replace(from, to));
      const fails = await rules(await load(tmp));
      if (fails.length) console.log('  ✓ ' + name + ' — caught (' + Array.from(new Set(fails.map((x) => x.split(':')[0]))).join(', ') + ')');
      else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(bad ? 'hunt-clips --mutate: ' + bad + ' escaped' : 'hunt-clips --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
