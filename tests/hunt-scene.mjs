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
//         same event add no effect, float or flash
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
//         frame of a diagonal step, vfx-set effects, the hit target flashed, a
//         corpse sorted beneath the standing, HP bars only when not full, a wand's
//         and a staff's basic hit drawn on the target
//   SC-7  FLOAT TOGGLES: the bleed badge shows over a boss and not over a
//         regular monster by default; a hidden float type never shows
//   SC-8  BOUNDED: a unit the pose stops listing is forgotten once its corpse
//         time has passed, so a long hunt's frame does not grow with its kills
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
    const hunt = M.manifests.hunt.sprites;
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

  { // SC-6: a caster's basic attack draws its hit on the target (the wand's burst, the staff's)
    for (const [weapon, want] of [['wand', 'fx_wand_bolt_impact'], ['staff', 'fx_staff_bolt_impact']]) {
      const clock = { t: C0 };
      const body = envelope(7, S0);
      body.party.members[1].weapon = weapon;
      const cs = session(M, clock, [body]);
      await cs.load();
      const v = viewer(M, cs);
      const seen = new Set();
      for (let s = S0 - 350; s <= S0 - 350 + M.X.PROJECTILE.flightMs + 200; s += 10) for (const e of v.at(at(s)).fx) seen.add(e.id);
      ok('SC-6', seen.has(want), 'a ' + weapon + "'s basic hit must draw " + want + ' on the rat, drew ' + JSON.stringify(Array.from(seen)));
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
    ok('SC-6', ratHit && ratHit.flash === true, 'the rat must flash as the bolt lands, got ' + JSON.stringify(ratHit && ratHit.flash));
    ok('SC-7', g.floats.some((x) => x.text === '6' && x.kind === 'hit'), 'the dealt number must float when the bolt lands: ' + JSON.stringify(g.floats));
    const mid = at(S0 + 174);
    const f = v.at(mid);
    const list = compose(f, mid);
    const tank = list.sprites.find((d) => d.id === 'outfit_knight');
    const se = M.manifests.hunt.sprites.outfit_knight.anims.walk.dirs.se;
    ok('SC-6', tank && tank.set === 'hunt' && se.some(([x, y]) => x === tank.sx && y === tank.sy), 'the tank must draw its south-east walk frame from the hunt atlas, got ' + JSON.stringify(tank && [tank.set, tank.sx, tank.sy]));
    ok('SC-6', list.sprites.some((d) => d.id === 'outfit_ranger' && d.set === 'hunt'), 'the ranger must draw from the hunt atlas');
    ok('SC-6', list.fx.some((e) => e.set === 'vfx' && e.id === 'fx_power_strike'), 'the strike must draw from the vfx atlas, got ' + JSON.stringify(list.fx.map((e) => [e.id, e.set])));
    ok('SC-6', !list.sprites.some((d) => d.kind === 'unit' && !d.set), 'no unit may draw as a stub: ' + list.sprites.filter((d) => d.kind === 'unit' && !d.set).map((d) => d.id));
    const late = v.at(at(S0 + 300 + 600));          // 600 ms after the rat's death
    const corpse = late.units.find((d) => d.unit === 101);
    const boss = late.units.find((d) => d.unit === 103);
    const list2 = compose(late, 0);
    const ci = list2.sprites.findIndex((d) => d.id === 'rat');
    const firstStanding = list2.sprites.findIndex((d) => d.kind === 'unit' && d.id !== 'rat');
    ok('SC-6', corpse && corpse.grey === 1 && corpse.alpha < 1 && ci >= 0 && ci < firstStanding,
      'the rat must lie grey beneath the standing, got ' + JSON.stringify({ grey: corpse && corpse.grey, alpha: corpse && corpse.alpha, ci, firstStanding }));
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
    const f = v.at(at(S0 + 60000));
    ok('SC-8', before && !cs.timeline.units().includes(101) && !f.units.some((d) => d.unit === 101) && cs.timeline.units().includes(103),
      'a unit gone from the pose must be forgotten after its corpse time: ' + JSON.stringify(cs.timeline.units()));
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
  return fails;
}

const MUTANTS = [
  ['the walk frame counts frames drawn', 'src/hunt-view/scene.js', 'const frame = moving ? Math.floor((p.d * walk.fps * tl.tileMs) / 1000) : 0;', 'globalThis.__n = (globalThis.__n || 0) + 1;\n    const frame = moving ? globalThis.__n % 6 : 0;'],
  ['an event plays twice', 'src/hunt-view/scene.js', '    if (!ev || keys.has(ev.key)) return false;\n', '    if (!ev) return false;\n'],
  ['an effect starts when it is delivered', 'src/hunt-view/scene.js', 'const start = tl.clientAt(ev.atMs) ?? now;', 'const start = now;'],
  ['playback runs ahead of the track', 'src/hunt-view/timeline.js', 'const f = Math.min(1, (t - cur.atMs) / cfg.tileMs);', 'const f = (t - cur.atMs + 200) / cfg.tileMs;'],
  ['an event type left unmapped', 'src/data/hunt-vfx.js', '  eat: null, drink: null,', '  drink: null,'],
  ['an effect the atlas lacks', 'src/data/hunt-vfx.js', "heal: row({ fx: 'fx_nature_heal_motes'", "heal: row({ fx: 'fx_heal_glow'"],
  ["a wand's basic hit shows nothing", 'src/data/hunt-vfx.js', "mage: 'fx_wand_bolt_impact'", 'mage: null'],
  ["a staff's bolt is missing", 'src/data/hunt-vfx.js', "healer: 'fx_staff_bolt' }", 'healer: null }'],
  ['the diagonal is dropped', 'src/hunt-view/scene.js', 'const diag = ax && ay && ', 'const diag = false && '],
  ['no flash on a hit', 'src/hunt-view/scene.js', '    flash.set(ev.t, land);\n', ''],
  ['a corpse stands among the living', 'src/world/core/compose.js', "bias: u.under ? -UNDER : 0,", 'bias: 0,'],
  ['the bleed badge ignores the toggle', 'src/hunt-view/scene.js', "(hero || read.shown('bleed_badge', isBoss(u)))", '(true)'],
  ['a float ignores its toggle', 'src/hunt-view/scene.js', '    if (!read.shown(type, isBoss(u))) return;\n', ''],
  ['a gone unit is kept for ever', 'src/hunt-view/timeline.js', 'if (!listed.has(u) && a[a.length - 1].atMs < pose.at_ms - cfg.forgetMs) steps.delete(u);', ''],
  ['bars from the events, not the snapshot', 'src/hunt-view/scene.js', 'const hp = hero ? m && m.hp : (read.units.get(u) || {}).hp;', 'const hp = 1;'],
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
