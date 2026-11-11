#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-scene.mjs — THE LIVE HUNT PLAYS SMOOTHLY, ONCE, AND FROM THE SERVER.
//
//   node tests/hunt-scene.mjs           the rules
//   node tests/hunt-scene.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/hunt-view/scene.js src/hunt-view/timeline.js src/data/hunt-vfx.js src/data/hunt-outfits.js src/world/core/compose.js
// mutant-writes-tree: no — mutants are planted into a temp copy of src/
//
// Rendering timing is independent of simulation and persistence (Tyler 10-18).
// These drive the REAL CharacterSession, timeline and scene (src/hunt-view/
// scene.js) over the shipped atlas manifests and compose the frame the canvas
// paints (src/world/core/compose.js):
//   SC-1  A NEW ENVELOPE MID-ANIMATION DOES NOT RESTART IT: after a restating
//         envelope the walking hero keeps its place and its walk frame, and a
//         running effect keeps its age (it is not re-started at 0, nor doubled)
//   SC-2  AN EVENT ID PLAYS ONCE: restated batches and a second delivery of the
//         same event add no effect, float or recoil
//   SC-3  INTERPOLATION STAYS WITHIN THE TRACK: every drawn unit stands on the
//         segment between the two steps around the instant shown, never past the
//         last step, and holds the last tile once the track ends
//   SC-4  FRAME-RATE INDEPENDENCE: the same instants drawn by a 30 fps and a
//         144 fps loop give the same units, walk frames, facings, floats and effects
//   SC-5  EVERY EVENT TYPE IS MAPPED (FX-05): each EVENT_TYPES key has an
//         EVENT_FX row or an explicit null, every effect named exists in the vfx
//         atlas, every outfit walks in all eight facings in the hunt atlas, every
//         ranged role's basic attack has a shipped bolt and every role a basic hit
//   SC-6  THE FRAME DRAWS IT: hunt-set sprites (never a stub) with the diagonal
//         frame of a diagonal step, vfx-set effects, a
//         corpse playing its death clip then lying as its corpse frame beneath the standing,
//         HP bars only when not full, a wand's and a staff's basic attack
//         drawn as its own bolt flying to the target, then its hit
//   SC-7  FLOAT TOGGLES: the bleed badge shows over a boss and not over a
//         regular monster by default; a hidden float type never shows
//   SC-11 A KILL MID-STEP: a rat killed while it walks finishes the step dead and lies
//         as its corpse with no bar (it was drawn standing at 0 HP for ever)
//   SC-8  BOUNDED: a unit the pose stops listing is forgotten once its corpse
//         time has passed, so a long hunt's frame does not grow with its kills
//   SC-9  ONE LOOK: the viewed hero wears the outfit the server says it chose (the
//         same sprite the town draws, session/hero-look.js), never its weapon
//         role's default — a druid-clad sword hero never flips to the knight
//   SC-10 NO SPIN: a hero standing between swings keeps facing its target; it
//         never turns back to its last walk heading and round again each swing
//   SC-13 A SNAPSHOT AHEAD OF THE SCREEN NEVER CUTS A DEATH SHORT (scene.js S9): a monster the
//         pose lists dead stands until its kill plays in the window behind it, then lies as its corpse
//   SC-12 THE LEVEL-UP MOMENT: "Level N" rises over the viewed hero once when the
//         server's Level goes up, never on a mount or reload, and not when its
//         Combat text toggle is off (designer 2026-10-22)
//   SC-14 A BLOW THAT DID NO HARM IS A SPARK, NOT A WORD (Tyler 2026-11-04): a miss, a dodge and a barrier's 0 on a
//         hero draw the spark on the side the blow came from, a hero's miss the scuff on the monster, and none of them
//         a float; one shows at a time on a unit under a full box's blows; 150 ms and gone; its toggle hides it
//         (the log's line for it all: tests/hunt-view-core.mjs LOG-4; nothing is immune since Tyler 2026-11-06)
//   SC-15 A HIT NEVER REPAINTS THE SPRITE (ART_DIRECTION §2, §11): facing a way its flinch is drawn, the struck unit plays its hit
//         clip in place; facing a way it is not, its draw entry is the entry it has once the hit has passed, 1 art px away from
//         the blow; either way its name, bar and tone stand (the hook itself: tests/hunt-clips.mjs)
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

async function load(base) {
  const u = (p) => import(pathToFileURL(join(base, p)).href + V);
  const M = {
    C: await u('src/session/character-session.js'),
    S: await u('src/hunt-view/scene.js'),
    H: await u('src/hunt-view/clip-hook.js'),
    F: await u('src/hunt-view/float-prefs.js'),
    X: await u('src/data/hunt-vfx.js'),
    R: await u('src/data/hunt-roles.js'),
    O: await u('src/data/hunt-outfits.js'),
    E: await u('src/core/hunt/events.js'),
    B: await u('src/world/core/book.js'),
    K: await u('src/world/core/compose.js'),
    MC: await u('src/world/core/map-compile.js'),
    MAPS: await u('src/data/world/maps/index.js'),
    TER: await u('src/data/world/terrain.js'),
    SETS: await u('src/data/world/atlas-sets.js'),
    AB: await u('src/data/world/art-budget.js'),
    XP: await u('src/core/xp.js'),
  };
  const manifests = {};
  for (const set of M.SETS.ATLAS_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  M.manifests = manifests;
  M.book = M.B.createBook(manifests);
  const sprites = new Proxy(M.book.sprites, { get: (t, k) => t[k] || M.B.STUB_SPRITE });
  M.tables = { materials: M.TER.MATERIALS, sprites, openClasses: M.TER.OPEN_CLASSES, lights: M.TER.LIGHTS };
  M.map = M.MC.compileMap(M.MAPS.WORLD_MAPS.find((m) => m.id === 'mill_cellar'), M.tables);
  return M;
}

const S0 = 2000000;     // the server clock of the first settle
const C0 = 100000;      // the client clock it arrives at
/* The scene's playback delay: the CharacterSession's (src/session/config.js huntPlaybackDelayMs), read, never typed. */
const DELAY = (await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href + V)).SESSION_CONFIG.huntPlaybackDelayMs;

/* The fixture character, hunting: the tank (unit 1) walks east then a diagonal; the
   ranger (2) stands; a rat (101) is hit, bleeds and dies; the boss (103) bleeds. */
function envelope(version, serverNow) {
  const e = clone(FIXTURE);
  e.version = version;
  e.hunt_server_now_ms = serverNow;
  e.hunt.pose = { at_ms: S0 + 1200, units: [
    { u: 1, side: 'hero', x: 13, y: 9 }, { u: 2, side: 'hero', x: 8, y: 9 },
    { u: 101, side: 'monster', kind: 'rat', x: 14, y: 9, hp: 0, hp_max: 30 },
    { u: 103, side: 'monster', kind: 'hive_wasp', boss: true, name: 'Hive Queen', x: 15, y: 7, hp: 80, hp_max: 120 }] };
  e.hunt_track = [
    { u: 1, x: 10, y: 8, atMs: S0 - 1000 }, { u: 1, x: 11, y: 8, atMs: S0 - 600 }, { u: 1, x: 12, y: 8, atMs: S0 - 288 },
    { u: 1, x: 13, y: 9, atMs: S0 + 24 },
    { u: 2, x: 8, y: 9, atMs: S0 - 1000 }, { u: 101, x: 14, y: 9, atMs: S0 - 1000 }, { u: 103, x: 15, y: 7, atMs: S0 - 1000 },
  ];
  e.hunt_events = [
    { id: 'k:1', type: 'cast', atMs: S0 + 100, u: 1, ability: 'power_strike', t: 101 },
    { id: 'k:2', type: 'dmg', atMs: S0 + 100, u: 1, t: 101, amount: 11, ability: 'power_strike', element: null },
    { id: 'k:3', type: 'dmg', atMs: S0 - 350, u: 2, t: 101, amount: 6, ability: 'basic', element: null },
    { id: 'k:4', type: 'status_on', atMs: S0 - 300, t: 101, status: 'bleed', stacks: 2 },
    { id: 'k:5', type: 'status_on', atMs: S0 - 300, t: 103, status: 'bleed', stacks: 3 },
    { id: 'k:6', type: 'kill', atMs: S0 + 300, u: 1, t: 101, loot: { rat_tail: 1 } },
    { id: 'k:7', type: 'xp_group', atMs: S0 + 300, amount: 6, by: { 1: 3, 2: 3 }, kills: 1, x: 14, y: 9 },
  ];
  /* the ranger is at full health and mana: it shows no bar */
  const r = e.party.members[1];
  r.hp = r.hp_max; r.mana = r.mana_max;
  return e;
}

/* A walk instant: client time showing server instant `s`. */
const at = (s) => C0 + DELAY + (s - S0);

function session(M, clock, bodies) {
  let i = 0;
  const server = { rpc: async () => ({ ok: true, body: clone(bodies[Math.min(i++, bodies.length - 1)]) }), accrue: async () => ({ ok: false }) };
  return new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555', server, setTimer: () => 0, clearTimer: () => {}, now: () => clock.t });
}

/* The world's loop, minus the canvas: advance the character's timeline, read its sections, draw. */
function viewer(M, cs) {
  const scene = M.S.createHuntScene({ timeline: cs.timeline, book: M.book, read: () => M.S.readHunt(cs) });
  cs.timeline.subscribe((ev) => scene.onEvent(ev, cs.now()));
  return {
    scene,
    at(now) { cs.timeline.advance(now); return scene.frame(now); },
  };
}

const unitOf = (f, u) => (f.hero && f.hero.unit === u ? f.hero : f.units.find((d) => d.unit === u));
const strip = (f) => JSON.stringify({ h: f.hero, u: f.units, fl: f.floats, fx: f.fx });

async function rules(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ': ' + msg); };

  { // SC-1, SC-2: a restating envelope mid-walk
    const clock = { t: C0 };
    const cs = session(M, clock, [envelope(7, S0), envelope(8, S0 + 500)]);
    await cs.load();
    const v = viewer(M, cs);
    clock.t = at(S0 + 174);               // the tank rolls 12,8 -> 13,9 (a diagonal), the strike playing
    const a = v.at(clock.t);
    const h0 = unitOf(a, 1);
    const fx0 = a.fx.find((e) => e.id === 'fx_power_strike');
    ok('SC-1', h0 && h0.anim === 'walk' && h0.x > 12 && h0.x < 13 && h0.diag === 'se', 'the tank must be mid-diagonal, got ' + JSON.stringify(h0 && { x: h0.x, anim: h0.anim, diag: h0.diag }));
    ok('SC-1', fx0 && fx0.age > 0, 'the power strike must be playing, got ' + JSON.stringify(a.fx.map((e) => e.id)));
    const played = v.scene.stats().played;
    clock.t = C0 + 500;                   // the next envelope arrives on the same clock relation
    await cs.load();
    const now = at(S0 + 174) + 16;
    clock.t = now;
    const b = v.at(now);
    const h1 = unitOf(b, 1);
    const fx1 = b.fx.filter((e) => e.id === 'fx_power_strike');
    ok('SC-1', h1 && h1.anim === 'walk' && h1.x > h0.x && h1.x - h0.x < 0.1 && h1.frame >= h0.frame && h1.frame <= h0.frame + 1,
      'a new envelope moved or restarted the walk: ' + JSON.stringify({ before: h0 && [h0.x, h0.frame], after: h1 && [h1.x, h1.frame] }));
    ok('SC-1', fx1.length === 1 && fx0 && Math.abs(fx1[0].age - fx0.age - 16) < 1e-6, 'a new envelope restarted or doubled an effect: ' + JSON.stringify({ before: fx0 && fx0.age, after: fx1.map((e) => e.age) }));
    ok('SC-2', v.scene.stats().played === played, 'a restated batch played again: ' + played + ' -> ' + v.scene.stats().played);
    const ev = { key: 'i:k:2', id: 'k:2', type: 'dmg', atMs: S0 + 100, u: 1, t: 101, amount: 11, ability: 'power_strike' };
    const before = v.scene.stats();
    const again = v.scene.onEvent(ev, now);
    const after = v.scene.stats();
    ok('SC-2', again === false && after.fx === before.fx && after.floats === before.floats, 'a second delivery of one event id added effects: ' + JSON.stringify({ before, after }));
  }

  { // SC-3: inside the track
    const clock = { t: C0 };
    const cs = session(M, clock, [envelope(7, S0)]);
    await cs.load();
    const v = viewer(M, cs);
    const track = envelope(7, S0).hunt_track.filter((s) => s.u === 1);
    let bad = null;
    for (let k = 0; k <= 400 && !bad; k++) {
      const now = C0 + DELAY - 1200 + k * 7.3;
      const d = unitOf(v.at(now), 1);
      const t = now - C0 - DELAY + S0;   // the server instant shown (the offset is exact here)
      let i = track.length - 1;
      while (i > 0 && track[i].atMs > t) i--;
      const p = track[Math.max(0, i - 1)], c = track[i];
      const inBox = d && d.x >= Math.min(p.x, c.x) - 1e-9 && d.x <= Math.max(p.x, c.x) + 1e-9 && d.y >= Math.min(p.y, c.y) - 1e-9 && d.y <= Math.max(p.y, c.y) + 1e-9;
      if (!inBox) bad = { now, t, at: d && [d.x, d.y], between: [[p.x, p.y], [c.x, c.y]] };
    }
    ok('SC-3', !bad, 'a unit left its track: ' + JSON.stringify(bad));
    const end = unitOf(v.at(C0 + DELAY + 60000), 1);
    ok('SC-3', end && end.x === 13 && end.y === 9 && end.anim !== 'walk', 'the track end must hold its last tile, got ' + JSON.stringify(end && [end.x, end.y, end.anim]));
  }

  { // SC-4: 30 fps vs 144 fps
    const run = async (fps) => {
      const clock = { t: C0 };
      const cs = session(M, clock, [envelope(7, S0)]);
      await cs.load();
      const v = viewer(M, cs);
      const out = [];
      const start = C0 + DELAY - 1100, stop = start + 2400;
      let next = start;
      for (let t = start; t <= stop; t += 1000 / fps) {
        clock.t = t;
        v.at(t);
        while (next <= t + 1000 / fps && next <= stop) {
          if (next <= t) { clock.t = next; out.push(strip(v.at(next))); next += 100; } else break;
        }
      }
      return out;
    };
    const slow = await run(30), fast = await run(144);
    const firstDiff = slow.findIndex((s, i) => s !== fast[i]);
    ok('SC-4', slow.length > 10 && slow.length === fast.length && firstDiff === -1,
      'the same instant drew differently at 30 and 144 fps (checkpoint ' + firstDiff + '): ' + (firstDiff >= 0 ? slow[firstDiff].slice(0, 220) + ' VS ' + fast[firstDiff].slice(0, 220) : slow.length + '/' + fast.length));
  }

  { // SC-5: the tables against the shipped art
    const types = Object.keys(M.E.EVENT_TYPES).sort(), mapped = Object.keys(M.X.EVENT_FX).sort();
    ok('SC-5', JSON.stringify(types) === JSON.stringify(mapped), 'EVENT_FX must map exactly the event types: missing ' + types.filter((t) => !mapped.includes(t)) + '; extra ' + mapped.filter((t) => !types.includes(t)));
    const vfx = M.manifests.vfx.sprites;
    const missing = M.X.effectIds().filter((id) => !vfx[id] || !vfx[id].anims.play);
    ok('SC-5', M.X.effectIds().length >= 20 && !missing.length, 'every named effect must ship in the vfx atlas; missing ' + missing.join(', '));
    const hunt = M.manifests.heroes.sprites;
    for (const [o, id] of Object.entries(M.O.OUTFITS)) {
      const s = hunt[id];
      const short = s ? M.AB.FACINGS.filter((d) => !(s.anims.walk && s.anims.walk.dirs[d] && s.anims.walk.dirs[d].length) || !(s.anims.idle && s.anims.idle.dirs[d])) : M.AB.FACINGS;
      ok('SC-5', !short.length, 'outfit ' + o + ' (' + id + ') lacks walk/idle in ' + short.join(','));
    }
    for (const r of Object.keys(M.O.ROLE_OUTFIT)) ok('SC-5', !!M.O.OUTFITS[M.O.ROLE_OUTFIT[r]], 'role ' + r + ' defaults to an outfit that does not ship');
    /* every ranged role's basic attack has a bolt and a hit, both shipped (FX-07: a wand or a staff showed nothing) */
    const plays = (id) => !!(id && vfx[id] && vfx[id].anims.play && vfx[id].anims.play.dirs.s.length);
    for (const [r, row] of Object.entries(M.R.HUNT_ROLES)) {
      const bolt = (M.X.PROJECTILE.role || {})[r];
      if (!row.melee) ok('SC-5', plays(bolt), 'ranged role ' + r + ' has no shipped bolt: ' + bolt);
      ok('SC-5', plays(M.X.HIT_FX.role[r]), 'role ' + r + ' has no shipped basic hit: ' + M.X.HIT_FX.role[r]);
    }
  }

  { // SC-6: a caster's basic attack flies its own bolt to the target, then draws its hit there (the wand's, the staff's)
    for (const [weapon, want, bolt] of [['wand', 'fx_wand_bolt_impact', 'fx_wand_bolt'], ['staff', 'fx_staff_bolt_impact', 'fx_staff_bolt']]) {
      const clock = { t: C0 };
      const body = envelope(7, S0);
      body.party.members[1].weapon = weapon;
      const cs = session(M, clock, [body]);
      await cs.load();
      const v = viewer(M, cs);
      const seen = new Set();
      for (let s = S0 - 350; s <= S0 - 350 + M.X.PROJECTILE.flightMs + 200; s += 10) for (const e of v.at(at(s)).fx) seen.add(e.id);
      ok('SC-6', seen.has(want), 'a ' + weapon + "'s basic hit must draw " + want + ' on the rat, drew ' + JSON.stringify(Array.from(seen)));
      ok('SC-6', seen.has(bolt), 'a ' + weapon + "'s basic attack must fly " + bolt + ' to the rat, drew ' + JSON.stringify(Array.from(seen)));
    }
  }

  { // SC-6, SC-7: the composed frame
    const clock = { t: C0 };
    const cs = session(M, clock, [envelope(7, S0)]);
    await cs.load();
    const v = viewer(M, cs);
    const view = { ox: 0, oy: 0, w: M.map.w * 32, h: M.map.h * 32 };
    const compose = (f, t) => M.K.composeFrame(M.map, M.book, Object.assign({ t, roofAlpha: {} }, f), view, M.tables, 32);
    const ratAlive = v.at(at(S0 - 200)).units.find((d) => d.unit === 101);
    ok('SC-7', ratAlive && !ratAlive.badge, 'a regular monster shows no bleed badge by default');
    const g = v.at(at(S0 - 350 + 220 + 40));        // 40 ms after the ranger's bolt lands on the rat
    const ratHit = g.units.find((d) => d.unit === 101);
    ok('SC-7', g.floats.some((x) => x.text === '6' && x.kind === 'hit'), 'the dealt number must float when the bolt lands: ' + JSON.stringify(g.floats));
    const mid = at(S0 + 174);
    const f = v.at(mid);
    const list = compose(f, mid);
    const tank = list.sprites.find((d) => d.id === 'outfit_knight');
    const se = M.manifests.heroes.sprites.outfit_knight.anims.walk.dirs.se;
    ok('SC-6', tank && tank.set === 'heroes' && se.some(([x, y]) => x === tank.sx && y === tank.sy), 'the tank must draw its south-east walk frame from the heroes atlas, got ' + JSON.stringify(tank && [tank.set, tank.sx, tank.sy]));
    ok('SC-6', list.sprites.some((d) => d.id === 'outfit_ranger' && d.set === 'heroes'), 'the ranger must draw from the heroes atlas');
    ok('SC-6', list.fx.some((e) => e.set === 'vfx' && e.id === 'fx_power_strike'), 'the strike must draw from the vfx atlas, got ' + JSON.stringify(list.fx.map((e) => [e.id, e.set])));
    ok('SC-6', !list.sprites.some((d) => d.kind === 'unit' && !d.set), 'no unit may draw as a stub: ' + list.sprites.filter((d) => d.kind === 'unit' && !d.set).map((d) => d.id));
    const late = v.at(at(S0 + 300 + 600));          // 600 ms after the rat's death
    const corpse = late.units.find((d) => d.unit === 101);
    const boss = late.units.find((d) => d.unit === 103);
    const list2 = compose(late, 0);
    const ci = list2.sprites.findIndex((d) => d.id === 'rat');
    const firstStanding = list2.sprites.findIndex((d) => d.kind === 'unit' && d.id !== 'rat');
    /* VW-05: a corpse plays the rat's own death clip, then lies as its corpse frame (never a greyed idle), beneath the standing. */
    const rat = M.manifests.hunt.sprites.rat.anims;
    const clipCells = (a) => Object.values((rat[a] && rat[a].dirs) || {}).flat();
    const drawn = ci >= 0 ? list2.sprites[ci] : null;
    ok('SC-6', corpse && (corpse.anim === 'death' || corpse.anim === 'corpse') && corpse.grey === 0 && ci >= 0 && ci < firstStanding
      && drawn && drawn.set === 'hunt' && clipCells(corpse.anim).some(([x, y]) => x === drawn.sx && y === drawn.sy),
      'the rat must lie as its death/corpse frame beneath the standing, got ' + JSON.stringify({ anim: corpse && corpse.anim, grey: corpse && corpse.grey, ci, firstStanding, at: drawn && [drawn.set, drawn.sx, drawn.sy] }));
    const tankBar = unitOf(late, 1);
    ok('SC-6', boss && Math.abs(boss.bar - 80 / 120) < 1e-9 && tankBar && Math.abs(tankBar.bar - 180 / 220) < 1e-9 && Math.abs(tankBar.mana - 40 / 60) < 1e-9 && unitOf(late, 2).bar === undefined,
      'bars are the snapshot\'s and only when not full: ' + JSON.stringify({ boss: boss && boss.bar, tank: tankBar && [tankBar.bar, tankBar.mana], ranger: unitOf(late, 2).bar }));
    ok('SC-7', boss && boss.badge === 3 && corpse && !corpse.badge, 'the bleed badge shows over the boss only by default, got ' + JSON.stringify({ boss: boss && boss.badge }));
    ok('SC-6', late.floats.some((x) => x.kind === 'xp' && x.text === '+3 XP' && x.big), 'the viewed hero\'s share of the kill floats big: ' + JSON.stringify(late.floats));
  }

  { // SC-8: bounded over a long hunt
    const clock = { t: C0 };
    const first = envelope(7, S0);
    const later = envelope(8, S0 + 60000);
    later.hunt.pose.at_ms = S0 + 60000;
    later.hunt.pose.units = later.hunt.pose.units.filter((p) => p.u !== 101);
    const cs = session(M, clock, [first, later]);
    await cs.load();
    const v = viewer(M, cs);
    v.at(at(S0 + 500));
    const before = cs.timeline.units().includes(101);
    clock.t = C0 + 60000;
    await cs.load();
    /* read before the next frame: the pose's own forget (timeline.js T5), not the scene's at its next frame (scene.js S8) */
    const held = cs.timeline.units();
    const f = v.at(at(S0 + 60000));
    ok('SC-8', before && !held.includes(101) && !cs.timeline.units().includes(101) && !f.units.some((d) => d.unit === 101) && cs.timeline.units().includes(103),
      'a unit gone from the pose must be forgotten after its corpse time: ' + JSON.stringify(held));
  }

  { // SC-9: the viewed hero's look is the server's chosen outfit, in the hunt as in town
    const clock = { t: C0 };
    const body = envelope(7, S0);
    body.outfit = { worn: 'druid', owned: ['knight', 'druid'], colors: {} };
    const cs = session(M, clock, [body]);
    await cs.load();
    const v = viewer(M, cs);
    const ids = new Set();
    for (let s = S0 - 900; s <= S0 + 2000; s += 50) { const h = unitOf(v.at(at(s)), 1); if (h) ids.add(h.id); }
    ok('SC-9', ids.size === 1 && ids.has('outfit_druid'), 'the viewed hero chose the druid outfit but was drawn as ' + JSON.stringify(Array.from(ids)));
  }

  { // SC-10: standing between swings, the hero keeps facing what it swung at
    const clock = { t: C0 };
    const cs = session(M, clock, [envelope(7, S0)]);
    await cs.load();
    const v = viewer(M, cs);
    const seen = new Set();
    for (let s = S0 + 150; s <= S0 + 2500; s += 50) { const h = unitOf(v.at(at(s)), 1); if (h && h.anim !== 'walk') seen.add(h.dir + '/' + h.diag); }
    ok('SC-10', seen.size === 1 && seen.has('e/null'), 'the tank stood by the rat it struck (east) but turned ' + JSON.stringify(Array.from(seen)));
  }

  { // SC-7: a hidden type never shows
    const clock = { t: C0 };
    const body = envelope(7, S0);
    body.hunt_events = body.hunt_events.filter((e) => e.type !== 'kill' && e.type !== 'xp_group');
    const cs = session(M, clock, [body]);
    await cs.load();
    cs.setResidue('combatText', M.F.withFloat(cs, 'dealt', 'regular', false));
    const v = viewer(M, cs);
    const fl = v.at(at(S0 - 350 + 220 + 40)).floats;
    ok('SC-7', !fl.some((x) => x.kind === 'hit'), 'damage dealt is switched off but floated: ' + JSON.stringify(fl));
  }

  { // SC-14: a blow that did no harm: the tank stands at 13,9 from S0 + 24, the rat at 14,9 (due east)
    const glances = () => {
      const body = envelope(7, S0);
      body.hunt_events = [
        { id: 'g:1', type: 'miss', atMs: S0 + 400, u: 101, t: 1 },
        { id: 'g:2', type: 'miss', atMs: S0 + 800, u: 101, t: 1, dodge: true },
        { id: 'g:3', type: 'miss', atMs: S0 + 900, u: 103, t: 1 },        // inside the gap: the next of a full box's blows
        { id: 'g:4', type: 'miss', atMs: S0 + 1000, u: 1, t: 101 },       // the tank's own swing
        { id: 'g:5', type: 'dmg', atMs: S0 + 1300, u: 101, t: 1, amount: 0, ability: 'basic', element: null },   // a barrier took all of it
      ];
      return body;
    };
    const named = (f, id) => f.fx.filter((e) => e.id === id);
    const clock = { t: C0 };
    const cs = session(M, clock, [glances()]);
    await cs.load();
    const v = viewer(M, cs);
    const a = v.at(at(S0 + 410));
    const spark = named(a, 'fx_glance_spark'), tank = unitOf(a, 1);
    ok('SC-14', spark.length === 1, 'a miss on a hero must draw the one spark, got ' + JSON.stringify(a.fx.map((e) => e.id)));
    ok('SC-14', !a.floats.length, 'a miss on a hero floats nothing, got ' + JSON.stringify(a.floats));
    ok('SC-14', spark[0] && tank && Math.abs(spark[0].x - tank.x - M.X.GLANCE_FX.reach) < 1e-9 && spark[0].y === tank.y && spark[0].on === tank.id && spark[0].lift === M.X.GLANCE_FX.lift,
      'the spark sits at the chest on the side the blow came from (the rat is due east), got ' + JSON.stringify(spark[0]) + ' on ' + JSON.stringify(tank && [tank.x, tank.y]));
    const painted = M.K.composeFrame(M.map, M.book, Object.assign({ t: at(S0 + 410), roofAlpha: {} }, a), { ox: 0, oy: 0, w: M.map.w * 32, h: M.map.h * 32 }, M.tables, 32).fx.find((e) => e.id === 'fx_glance_spark');
    ok('SC-14', painted && painted.set === 'vfx' && painted.w === 9 && painted.blend === 'over' && painted.cx === Math.round((13 + M.X.GLANCE_FX.reach + 0.5) * 32),
      'the canvas paints it from the vfx atlas, hard-edged (never additive), at the body\'s edge: ' + JSON.stringify(painted));
    ok('SC-14', !named(v.at(at(S0 + 400 + 160)), 'fx_glance_spark').length, 'a spark is gone within 150 ms: it is a fatigue budget (ART_DIRECTION §11)');
    const dodge = v.at(at(S0 + 810));
    ok('SC-14', named(dodge, 'fx_glance_spark').length === 1 && !dodge.floats.length, 'a dodge is the same spark, no word: ' + JSON.stringify([dodge.fx.map((e) => e.id), dodge.floats]));
    const busy = v.at(at(S0 + 910));
    ok('SC-14', named(busy, 'fx_glance_spark').length === 1 && named(busy, 'fx_glance_spark')[0].age >= 100, 'a blow inside the gap shows no second spark on that hero: ' + JSON.stringify(busy.fx));
    const swing = v.at(at(S0 + 1010));
    ok('SC-14', named(swing, 'fx_glance_scuff').length === 1 && !named(swing, 'fx_glance_spark').length && !swing.floats.length,
      'a hero\'s own miss is the scuff on the monster, no word: ' + JSON.stringify([swing.fx.map((e) => e.id), swing.floats]));
    const barrier = v.at(at(S0 + 1310));
    ok('SC-14', named(barrier, 'fx_glance_spark').length === 1 && !barrier.floats.length && !unitOf(barrier, 1).recoil,
      'a blow a barrier took whole is a spark, no 0 and no recoil: ' + JSON.stringify([barrier.fx.map((e) => e.id), barrier.floats]));

    const off = { t: C0 };
    const quiet = session(M, off, [glances()]);
    await quiet.load();
    quiet.setResidue('combatText', M.F.withFloat(quiet, 'miss', 'regular', false));
    const q = viewer(M, quiet);
    const hidden = [410, 810, 1010, 1310].flatMap((ms) => q.at(at(S0 + ms)).fx.map((e) => e.id));
    ok('SC-14', !hidden.some((id) => /glance/.test(id)), 'the toggle hides the spark as it hid the word, got ' + JSON.stringify(hidden));
  }

  { // SC-15: the ranger on 8,9 shoots the rat on 14,9, so it gives east. The rat walked up from 14,10: it faces NORTH,
    // where its flinch is not drawn (the verdict dropped it, and no NE or NW is drawn), so the hook plays the recoil.
    const clock = { t: C0 };
    const body = envelope(7, S0);
    body.hunt_track = body.hunt_track.filter((st) => st.u !== 101).concat([{ u: 101, x: 14, y: 10, atMs: S0 - 2000 }, { u: 101, x: 14, y: 9, atMs: S0 - 1000 }]);
    const cs = session(M, clock, [body]);
    await cs.load();
    const v = viewer(M, cs);
    const view = { ox: 0, oy: 0, w: M.map.w * 32, h: M.map.h * 32 };
    const list = (s) => M.K.composeFrame(M.map, M.book, Object.assign({ t: at(s), roofAlpha: {} }, v.at(at(s))), view, M.tables, 32);
    const rat = (l) => l.sprites.find((d) => d.id === 'rat' && d.tx === 14 && d.ty === 9);
    const landed = S0 - 350 + M.X.PROJECTILE.flightMs;
    const struck = list(landed + 40), passed = list(landed + M.H.CLIP_RULES.recoilMs + 10);
    const a = rat(struck), b = rat(passed);
    ok('SC-15', a && b && a.x === b.x + 1 && a.y === b.y, 'the struck rat stands 1 art px east of its spot, got ' + JSON.stringify([a && [a.x, a.y], b && [b.x, b.y]]));
    /* the idle turns on the clock, hit or no hit (SC-IDLE): the struck frame is the one that clock names, and everything else stands */
    const still = (d) => JSON.stringify({ ...d, x: 0, sx: 0, sy: 0 });
    ok('SC-15', a && b && still(a) === still(b), 'a hit changes no tone or alpha of the sprite: ' + JSON.stringify([a, b]));
    const u = unitOf(v.at(at(landed + 40)), 101);
    const named = u && M.book.frame('rat', 'idle', M.book.facing('rat', 'idle', u.dir, u.diag), Math.floor(at(landed + 40) * M.book.sprite('rat').anims.idle.fps / 1000) + 101);
    ok('SC-15', a && named && a.sx === named.sx && a.sy === named.sy, 'a hit changes no frame: the struck rat draws its idle at that instant, got ' + JSON.stringify([a && [a.sx, a.sy], named && [named.sx, named.sy]]));
    const cx = b && b.x + M.book.sprite('rat').anchor[0];
    ok('SC-15', struck.bars.some((x) => x.x === cx) && passed.bars.some((x) => x.x === cx), 'a recoil leaves the bar where it stands: ' + JSON.stringify([cx, struck.bars, passed.bars]));

    /* ...and facing SOUTH (the fixture's own track), where its flinch is drawn, the rat plays it in place: the clip is the
       reaction, so nothing slides, no tone changes, and the frame is the hit clip's own (clip-hook.js H2) */
    const clock2 = { t: C0 };
    const cs2 = session(M, clock2, [envelope(7, S0)]);
    await cs2.load();
    const v2 = viewer(M, cs2);
    const list2 = (s) => M.K.composeFrame(M.map, M.book, Object.assign({ t: at(s), roofAlpha: {} }, v2.at(at(s))), view, M.tables, 32);
    const f0 = list2(landed + 40), u0 = unitOf(v2.at(at(landed + 40)), 101), after = list2(landed + M.H.CLIP_RULES.recoilMs + 10);
    const c = rat(f0), d = rat(after), hit0 = M.book.frame('rat', 'hit', 's', 0);
    ok('SC-15', u0 && u0.anim === 'hit' && u0.frame === 0 && u0.dir === 's' && !u0.recoil, 'the struck rat facing south must play its hit clip from frame 0, no recoil: ' + JSON.stringify(u0 && [u0.anim, u0.frame, u0.dir, u0.recoil]));
    ok('SC-15', c && d && c.x === d.x && c.y === d.y && c.sx === hit0.sx && c.sy === hit0.sy && still(c) === still(d), 'a flinch draws the clip in place, no slide or tint: ' + JSON.stringify([c, d]));
    /* the tank's power strike lands at S0 + 100 inside the first flinch: the latest blow starts the flinch again */
    const u1 = unitOf(v2.at(at(S0 + 100 + 40)), 101);
    ok('SC-15', u1 && u1.anim === 'hit' && u1.frame === 0, 'the next blow flinches the rat from frame 0 again: ' + JSON.stringify(u1 && [u1.anim, u1.frame]));
  }

  { // SC-11: the rat starts a step 50 ms before the blow that kills it
    const clock = { t: C0 };
    const body = envelope(7, S0);
    body.hunt_track = body.hunt_track.filter((st) => st.u !== 101).concat([{ u: 101, x: 14, y: 9, atMs: S0 - 1000 }, { u: 101, x: 14, y: 10, atMs: S0 + 250 }]);
    const cs = session(M, clock, [body]);
    await cs.load();
    const v = viewer(M, cs);
    const seen = [];
    for (let s = S0 + 200; s <= S0 + 1500; s += 25) { const d = unitOf(v.at(at(s)), 101); if (d && s > S0 + 300) seen.push(d); }
    const up = seen.filter((d) => !d.under || d.bar !== undefined);
    ok('SC-11', seen.length > 0 && up.length === 0, 'a rat killed mid-step was drawn standing in ' + up.length + ' of ' + seen.length + ' frames: ' + JSON.stringify(up[0] || null));
  }

  { // SC-13: the pose (at S0 + 1200) lists the rat dead while the screen plays the window a delay behind it; its kill
    // at S0 + 300 must still play: the snapshot's death applies only once the screen reaches the snapshot's instant
    const clock = { t: C0 };
    const body = envelope(7, S0);
    body.hunt.pose.units = body.hunt.pose.units.map((p) => (p.u === 101 ? Object.assign({}, p, { alive: false }) : p));
    const cs = session(M, clock, [body]);
    await cs.load();
    const v = viewer(M, cs);
    const before = unitOf(v.at(at(S0 + 200)), 101);
    const after = unitOf(v.at(at(S0 + 400)), 101);
    ok('SC-13', before && !before.under && after && after.under,
      'a snapshot ahead of the screen felled the rat before its kill played: ' + JSON.stringify({ before: before ? { under: before.under } : null, after: after ? { under: after.under } : null }));
  }

  { // SC-12: the level-up moment plays once when the SERVER's Level rises, never on a mount, and obeys its toggle
    const xpAt = (L) => M.XP.charXpForLevel(L);
    /* the server's Level rides its own `level` block; the Level XP stands still, so only the server's word moves the Level (lane/c-level-from-server) */
    const lv = (version, serverNow, L) => { const e = envelope(version, serverNow); e.state = Object.assign({}, e.state, { level_xp: xpAt(3) }); e.level = { xp: xpAt(3), level: L, into: 0, need: 100 }; return e; };
    const levelFloats = (f) => f.floats.filter((x) => /^Level \d+$/.test(x.text));
    const run = async (off) => {
      const clock = { t: C0 };
      const cs = session(M, clock, [lv(7, S0, 4), lv(8, S0 + 1000, 5)]);
      await cs.load();
      if (off) cs.setResidue('combatText', M.F.withFloat(cs, 'level', 'regular', false));
      const v = viewer(M, cs);
      const mount = levelFloats(v.at(at(S0 + 500)));
      clock.t = C0 + 1000;
      await cs.load();
      const up = levelFloats(v.at(at(S0 + 1100)));
      const later = levelFloats(v.at(at(S0 + 1200)));
      return { mount, up, later };
    };
    const on = await run(false), off = await run(true);
    ok('SC-12', on.mount.length === 0 && on.up.length === 1 && on.up[0].text === 'Level 5' && on.later.length === 1 && off.up.length === 0,
      'the Level rose 4 -> 5 on the server: mount ' + JSON.stringify(on.mount) + ', after ' + JSON.stringify(on.up) + ', a frame later ' + on.later.length + ', toggle off ' + JSON.stringify(off.up));
  }

  { // SC-IDLE: a standing unit's idle turns on the clock, on one edge for everyone (a held hunt paints at the clip's rate, never once per unit), never in step
    const clock = { t: C0 };
    /* a second rat beside the first: the pack this rule is about */
    const e = envelope(7, S0);
    e.hunt.pose.units.push({ u: 102, side: 'monster', kind: 'rat', x: 16, y: 9, hp: 30, hp_max: 30 });
    e.hunt_track.push({ u: 102, x: 16, y: 9, atMs: S0 - 1000 });
    const cs = session(M, clock, [e]);
    await cs.load();
    const v = viewer(M, cs);
    const ms = 1000 / M.manifests.hunt.sprites.rat.anims.idle.fps;
    const edge = Math.ceil(at(S0 - 500) / ms) * ms;
    clock.t = edge;
    const a = v.at(edge), mid = v.at(edge + ms / 2), next = v.at(edge + ms);
    const rat = unitOf(a, 101), other = unitOf(a, 102);
    ok('SC-IDLE', rat && other && rat.anim === 'idle' && other.anim === 'idle', 'both rats must stand here, got ' + JSON.stringify([rat && rat.anim, other && other.anim]));
    ok('SC-IDLE', unitOf(mid, 101).frame === rat.frame && unitOf(next, 101).frame === rat.frame + 1, 'the idle must turn once per frame of its clip: ' + JSON.stringify([rat.frame, unitOf(mid, 101).frame, unitOf(next, 101).frame]));
    ok('SC-IDLE', unitOf(mid, 102).frame === other.frame && unitOf(next, 102).frame === other.frame + 1, 'every unit turns on the same edge: ' + JSON.stringify([other.frame, unitOf(mid, 102).frame, unitOf(next, 102).frame]));
    ok('SC-IDLE', rat.frame !== other.frame, 'two units stood on the same frame of the loop: a pack breathing in step (' + rat.frame + ')');
    const cells = new Set();
    for (let k = 0; k < 4; k++) { const d = unitOf(v.at(edge + ms * (1 + k)), 101); const f = M.book.frame(d.id, d.anim, d.dir, d.frame); cells.add(f.sx + ',' + f.sy); }
    const loop = new Set(M.manifests.hunt.sprites.rat.anims.idle.dirs[rat.dir].map(String));
    ok('SC-IDLE', cells.size === loop.size && loop.size >= 3, 'four turns must draw the whole loop, and a loop is at least three drawings: ' + cells.size + ' cells of ' + loop.size);
  }
  return fails;
}

const MUTANTS = [
  ['the walk frame counts frames drawn', 'src/hunt-view/scene.js', 'let frame = corpse ? corpse.frame : moving ? Math.floor((p.d * walk.fps * tl.tileMs) / 1000) : idleFrame(clips.idle, now, u);', 'globalThis.__n = (globalThis.__n || 0) + 1;\n    let frame = corpse ? corpse.frame : moving ? globalThis.__n % 6 : idleFrame(clips.idle, now, u);'],
  ['a standing unit is held on its first idle frame (SC-IDLE)', 'src/hunt-view/scene.js', ': idleFrame(clips.idle, now, u);', ': 0;'],
  ['a pack breathes in step (SC-IDLE)', 'src/hunt-view/scene.js', 'Math.floor((now * idle.fps) / 1000) + u : 0;', 'Math.floor((now * idle.fps) / 1000) : 0;'],
  ['each unit turns on an edge of its own, so a held hunt paints once per unit (SC-IDLE)', 'src/hunt-view/scene.js', 'Math.floor((now * idle.fps) / 1000) + u : 0;', 'Math.floor(((now + u * 37) * idle.fps) / 1000) + u : 0;'],
  ['the snapshot fells a monster before the screen reaches it (SC-13)', 'src/hunt-view/scene.js', ' && shownAt >= read.poseAtMs;', ';'],
  ['a monster killed mid-step stands up again', 'src/hunt-view/scene.js', '      if (p.moving && !gone && !serverDead(u)) { dead.delete(u);', '      if (p.moving && !serverDead(u)) { dead.delete(u);'],
  ['an event plays twice', 'src/hunt-view/scene.js', '    if (!ev || keys.has(ev.key)) return false;\n', '    if (!ev) return false;\n'],
  ['an effect starts when it is delivered', 'src/hunt-view/scene.js', 'const start = tl.clientAt(ev.atMs) ?? now;', 'const start = now;'],
  ['playback runs ahead of the track', 'src/hunt-view/timeline.js', 'const f = Math.min(1, (t - cur.atMs) / (cur.dur || cfg.tileMs));', 'const f = (t - cur.atMs + 200) / (cur.dur || cfg.tileMs);'],
  ['an event type left unmapped', 'src/data/hunt-vfx.js', '  eat: null, drink: null,', '  drink: null,'],
  ['an effect the atlas lacks', 'src/data/hunt-vfx.js', "heal: row({ fx: 'fx_nature_heal_motes'", "heal: row({ fx: 'fx_heal_glow'"],
  ["a wand's basic hit shows nothing", 'src/data/hunt-vfx.js', "mage: 'fx_wand_bolt_impact'", 'mage: null'],
  ["a staff's bolt is missing", 'src/data/hunt-vfx.js', "healer: 'fx_staff_bolt' }", 'healer: null }'],
  ['the diagonal is dropped', 'src/hunt-view/scene.js', 'const diag = ax && ay && ', 'const diag = false && '],
  ['no flinch on a hit (SC-15)', 'src/hunt-view/scene.js', '    if (struckBy(ev) !== null) hook.hit(ev.t, ', '    if (false) hook.hit(ev.t, '],
  ['a recoil goes toward the blow (SC-15)', 'src/hunt-view/scene.js', 'a && b ? Math.round((b.x - a.x) / d) : 0,', 'a && b ? Math.round((a.x - b.x) / d) : 0,'],
  ['a hit tints the sprite again (SC-15)', 'src/world/core/compose.js', 'if (u.recoil) { ', 'if (u.recoil) { d.grey = 0.7; '],
  ['a recoil shakes the name and the bar too (SC-15)', 'src/world/core/compose.js', 'const d = place(u.id, u.x, u.y, {', 'const d = place(u.id, u.x + (u.recoil ? u.recoil[0] / 32 : 0), u.y, {'],
  ['a corpse stands among the living', 'src/world/core/compose.js', "bias: u.under ? -UNDER : 0,", 'bias: 0,'],
  ['the bleed badge ignores the toggle', 'src/hunt-view/scene.js', "(hero || read.shown('bleed_badge', isBoss(u)))", '(true)'],
  ['a float ignores its toggle', 'src/hunt-view/scene.js', '    if (!read.shown(type, isBoss(u))) return;\n', ''],
  ['a gone unit is kept for ever', 'src/hunt-view/timeline.js', 'if (!listed.has(u) && a[a.length - 1].atMs < pose.at_ms - cfg.forgetMs) steps.delete(u);', ''],
  ['bars from the events, not the snapshot', 'src/hunt-view/scene.js', 'const hp = played ? played.hp : hero ? m && m.hp : (read.units.get(u) || {}).hp;', 'const hp = 1;'],
  ["only a ranger's shot flies (a caster's bolt is dropped)", 'src/hunt-view/scene.js', 'const bolt = Object.hasOwn(PROJECTILE.ability, ev.ability) ? PROJECTILE.ability[ev.ability] : PROJECTILE.role[role] || null;', "const bolt = role === 'ranger' ? PROJECTILE.role.ranger : null;"],
  ['the hunt draws the role default, not the chosen outfit', 'src/hunt-view/scene.js', '    if (u === read.viewed && read.look) return read.look;', 'if (false) return read.look;'],
  ['a standing hero turns back to its walk heading after a swing', 'src/hunt-view/scene.js', 'if (!p.moving && s && (act || now - s.at >= 0)) {', 'if (!p.moving && s && (act || now - s.at >= 0) && now - s.at < 700) {'],
  ['a corpse greys its idle instead of its death clip', 'src/hunt-view/scene.js', '          corpse = hook.fallAt(id, age, fell);', '          corpse = null;'],
  ['a Level rise plays no moment', 'src/hunt-view/scene.js', '    if (p) floats.push({ text: \'Level \' + lv,', '    if (false) floats.push({ text: \'Level \' + lv,'],
  ['a mount plays a level-up it never saw', 'src/hunt-view/scene.js', 'const up = lastLevel !== null && lv > lastLevel;', 'const up = lv > (lastLevel || 0);'],
  ['the level-up ignores its toggle', 'src/hunt-view/scene.js', "!read.shown('level', false)", 'false'],
  ['a miss floats its word again (SC-14)', 'src/hunt-view/scene.js', "      case 'miss': glance(ev, start); break;", "      case 'miss': addFloat(ev.t, 'miss', 'miss', 'miss', start); glance(ev, start); break;"],
  ['a miss draws nothing (SC-14)', 'src/hunt-view/scene.js', "      case 'miss': glance(ev, start); break;", "      case 'miss': break;"],
  ['the spark ignores its toggle (SC-14)', 'src/hunt-view/scene.js', "    if (!read.shown('miss', isBoss(ev.t))) return;\n", ''],
  ['a full box sparks on every blow (SC-14)', 'src/hunt-view/scene.js', '    if (last !== undefined && Math.abs(start - last) < GLANCE_FX.gapMs) return;\n', ''],
  ['every spark lands on one pixel (SC-14)', 'src/hunt-view/scene.js', '{ follow: ev.t, ox: (dx / d) * GLANCE_FX.reach, oy: (dy / d) * GLANCE_FX.reach }', '{ follow: ev.t }'],
  ['the offset is dropped when the frame reads it (SC-14)', 'src/hunt-view/scene.js', 'x: p.x + (e.ox || 0), y: p.y + (e.oy || 0), age', 'x: p.x, y: p.y, age'],
  ['a monster wears the hero\'s spark (SC-14)', 'src/hunt-view/scene.js', 'isHero(ev.t) ? GLANCE_FX.hero : GLANCE_FX.monster', 'GLANCE_FX.hero'],
  ['a barrier floats a 0 (SC-14)', 'src/hunt-view/scene.js', 'if (ev.amount === 0 && isHero(ev.t)) glance(ev, start); else num(', 'num('],
  ['the spark names art the atlas lacks (SC-5)', 'src/data/hunt-vfx.js', "hero: 'fx_glance_spark'", "hero: 'fx_glance_sparks'"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(await load(ROOT));
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'hunt-scene: ' + fails.length + ' rule(s) RED' : 'hunt-scene: no restart on a new envelope, each event once, inside the track, frame-rate independent, every event mapped, drawn from the shipped atlases, toggles kept');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await rules(await load(ROOT));
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'hr-huntscene-'));
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
  console.log(bad ? 'hunt-scene --mutate: ' + bad + ' escaped' : 'hunt-scene --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
