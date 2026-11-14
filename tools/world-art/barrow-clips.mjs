// ════════════════════════════════════════════════════════════════════════
// tools/world-art/barrow-clips.mjs — THE BARROW MARCH'S COMBAT CLIPS (data for import-clips.mjs, beside hunt-clips.mjs).
//
// The swings, falls and flinches of the Slake's, the Pyre Field's and Krell's Hold's bodies (lane/b-barrow-art-import,
// 2026-11-14). Only what the generation notes KEPT: art/world-src/gen-2026-11-14/21-, 25-, 27-, 28-note.json and
// gen-2026-11-09b/b7-pyre-bodies, b8-pyre-wraith (their attack-lay.json is the reviewed lay, read here, never retyped).
// A facing a note refused is ABSENT: the hunt's hook plays nothing there that is not drawn, and a body with no flinch
// takes the engine's 1 px recoil. Row shape: hunt-clips.mjs.
//
// Two raw layouts:
//   11-14  <body>/<clip>/<facing>/f00.png … f06.png, f00 the still the clip started from (so it registers itself)
//   11-09b <body>/<clip>/<facing>/frame_000.png …, the still is <body>/<facing>.png
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME } from './hunt-clips.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const G14 = 'art/world-src/gen-2026-11-14';
const B13 = 'art/world-src/gen-2026-11-09b';
const ALL8 = ['s', 'e', 'n', 'w', 'se', 'sw', 'ne', 'nw'];
const SWING = [1, 2, 3, 4, 5, 6];       // a v3 clip less its still: six frames at 10 fps, the blow declared on index 3
const FLINCH = [0, 1, 2, 3, 4];         // brief 25: the still and four frames, 12 fps, home by the engine

/* 11-14: clip `src` of `base` in `facings` */
const of14 = (base, src, facings, lay = SWING) => Object.fromEntries(facings.map((f) => [f, { dir: `${base}/${src}/${NAME[f]}`, lay }]));
const swing14 = (...parts) => ({ attack: { fps: 10, hit: 3, dirs: Object.assign({}, ...parts) } });
const fall14 = (...parts) => ({ death: { fps: 10, dirs: Object.assign({}, ...parts) } });
const hit14 = (...parts) => ({ hit: { fps: 12, dirs: Object.assign({}, ...parts) } });

/* 11-09b: a b7/b8 body. Its attack lay is the reviewed attack-lay.json (clip and order a facing); a facing whose lay holds
   one frame (every other frame carried a trail) has no swing and is left out. */
const P = (batch, id) => `${B13}/${batch}/${id}`;
function pyreSwing(batch, id) {
  const lay = JSON.parse(readFileSync(join(ROOT, P(batch, id), 'attack-lay.json'), 'utf8'));
  const dirs = {};
  for (const f of ALL8) {
    const row = lay[NAME[f]];
    if (!row || !row.order || new Set(row.order).size < 3) continue;
    dirs[f] = { dir: `${P(batch, id)}/${row.clip}/${NAME[f]}`, still: `${P(batch, id)}/${NAME[f]}.png`, lay: row.order };
  }
  return { attack: { fps: 10, hit: 3, dirs } };
}
/* its falls: the seated plain fall, or the seated pose route where the plain one was refused (`pose`: facing -> lay or null) */
function pyreFall(batch, id, pose = {}) {
  const dirs = {};
  for (const f of ALL8) {
    const posed = Object.prototype.hasOwnProperty.call(pose, f);
    dirs[f] = { dir: `${P(batch, id)}/${posed ? 'deathpose-seated' : 'death-seated'}/${NAME[f]}`, still: `${P(batch, id)}/${NAME[f]}.png`, ...(posed && pose[f] ? { lay: pose[f] } : {}) };
  }
  return { death: { fps: 10, dirs } };
}
/* brief 25 round 2 (hit2): the facings the note kept */
const pyreHit = (id, facings) => hit14(of14(`${G14}/25-pyre-hits/${id}`, 'hit2', facings, FLINCH));

const SL = (id) => `${G14}/21-slake-clips/${id}`;
const HA = (id) => `${G14}/27-hold-bodies-a/${id}`;
const HB = (id) => `${G14}/28-hold-bodies-b/${id}`;

export const BARROW_CLIPS = Object.freeze([
  /* ── THE SLAKE (21-note.json "kept clips") ── */
  { set: 'slake', id: 'greened_pikeman', clips: {
    ...swing14(of14(SL('greened_pikeman'), 'attack', ['s', 'sw', 'w', 'nw', 'n']), of14(SL('greened_pikeman'), 'attack2', ['e', 'ne', 'se'])),
    ...fall14(of14(SL('greened_pikeman'), 'death', ['sw', 'n', 'ne', 'se']), of14(SL('greened_pikeman'), 'death2', ['e', 'nw', 'w']), of14(SL('greened_pikeman'), 'death3', ['s'])),
    /* 25-note: the re-rolled flinch is calm in S, SW, W; the pike swings level in the other five */
    ...hit14(of14(SL('greened_pikeman'), 'hit2', ['s', 'sw', 'w'], FLINCH)) } },
  { set: 'slake', id: 'bargeman', clips: {
    ...swing14(of14(SL('bargeman'), 'attack', ALL8)), ...fall14(of14(SL('bargeman'), 'death', ALL8)), ...hit14(of14(SL('bargeman'), 'hit', ALL8, FLINCH)) } },
  /* raw name flag_sergeant: the pack's row is color_sergeant */
  { set: 'slake', id: 'color_sergeant', clips: {
    ...swing14(of14(SL('flag_sergeant'), 'attack2', ['s', 'sw', 'w', 'nw', 'n', 'ne']), of14(SL('flag_sergeant'), 'attack3', ['e', 'se'])),
    ...fall14(of14(SL('flag_sergeant'), 'death', ALL8)), ...hit14(of14(SL('flag_sergeant'), 'hit', ALL8, FLINCH)) } },

  /* ── THE PYRE FIELD (b7, b8, 25-note.json) ── */
  { set: 'pyrefolk', id: 'charred_pikeman', clips: {
    ...pyreSwing('b7-pyre-bodies', 'charred_pikeman'), ...pyreFall('b7-pyre-bodies', 'charred_pikeman', { e: null, ne: null, sw: null }),
    ...pyreHit('charred_pikeman', ['n', 'ne', 'nw', 'w', 'sw']) } },
  { set: 'pyrefolk', id: 'stoker', clips: {
    ...pyreSwing('b7-pyre-bodies', 'stoker'), ...pyreFall('b7-pyre-bodies', 'stoker', { n: [0, 1, 3, 4, 5, 6] }),
    ...pyreHit('stoker', ['ne', 'nw', 'se', 'sw', 'w']) } },
  { set: 'pyrefolk', id: 'lurcher', clips: {
    ...pyreSwing('b7-pyre-bodies', 'lurcher'), ...pyreFall('b7-pyre-bodies', 'lurcher', { s: null }),
    ...pyreHit('lurcher', ['s', 'se', 'e', 'sw', 'w', 'n']) } },
  { set: 'pyrefolk', id: 'pyre_wraith', clips: {
    attack: { fps: 10, hit: 3, dirs: Object.fromEntries(ALL8.map((f) => [f, { dir: `${P('b8-pyre-wraith', 'pyre_wraith')}/attack/${NAME[f]}`, still: `${P('b8-pyre-wraith', 'pyre_wraith')}/${NAME[f]}.png` }])) },
    ...pyreFall('b8-pyre-wraith', 'pyre_wraith', { s: null }), ...pyreHit('pyre_wraith', ALL8) } },

  /* ── KRELL'S HOLD (27-, 28-note.json "kept clips") ── */
  { set: 'holdguard', id: 'farmhand', clips: {
    ...swing14(of14(HA('farmhand'), 'attack', ['s', 'e', 'n', 'se', 'sw', 'ne']), of14(HA('farmhand'), 'attack2', ['w']), of14(HA('farmhand'), 'attack3', ['nw'])),
    ...fall14(of14(HA('farmhand'), 'death', ALL8)), ...hit14(of14(HA('farmhand'), 'hit', ALL8, FLINCH)) } },
  { set: 'holdguard', id: 'hasks_lookout', clips: {
    /* S and SW lose the red tabard on the last frame: the lay ends a frame early */
    ...swing14(of14(HA('hasks_lookout'), 'attack', ['e', 'n', 'w', 'se', 'ne', 'nw']), of14(HA('hasks_lookout'), 'attack', ['s', 'sw'], [1, 2, 3, 4, 5])),
    ...fall14(of14(HA('hasks_lookout'), 'death', ALL8)), ...hit14(of14(HA('hasks_lookout'), 'hit', ['e', 'n', 'w', 'se', 'sw', 'nw'], FLINCH)) } },
  { set: 'holdguard', id: 'grave_guard', clips: {
    ...swing14(of14(HA('grave_guard'), 'attack', ['s', 'sw', 'e']), of14(HA('grave_guard'), 'attack2', ['w', 'nw', 'se']), of14(HA('grave_guard'), 'attack3', ['n', 'ne'])),
    ...fall14(of14(HA('grave_guard'), 'death', ALL8)), ...hit14(of14(HA('grave_guard'), 'hit', ['s', 'nw'], FLINCH)) } },
  { set: 'holdkeep', id: 'pyre_priest', clips: {
    ...swing14(of14(HB('pyre_priest'), 'attack', ALL8)), ...fall14(of14(HB('pyre_priest'), 'death', ALL8)), ...hit14(of14(HB('pyre_priest'), 'hit', ALL8, FLINCH)) } },
  { set: 'holdkeep', id: 'gatekeeper', clips: {
    ...swing14(of14(HB('gatekeeper'), 'attack', ['e', 'n', 'w', 'sw', 'ne', 'nw']), of14(HB('gatekeeper'), 'attack2', ['s', 'se'])),
    ...fall14(of14(HB('gatekeeper'), 'death', ['s', 'n', 'w', 'se', 'sw', 'ne', 'nw']), of14(HB('gatekeeper'), 'death2', ['e'])) } },
  { set: 'holdkeep', id: 'lord_krell', clips: {
    /* attack2 N and NW: frames 0-4 only (a blue arc on the last two) */
    ...swing14(of14(HB('lord_krell'), 'attack', ['s', 'e', 'se']), of14(HB('lord_krell'), 'attack2', ['sw', 'w', 'ne']), of14(HB('lord_krell'), 'attack2', ['n', 'nw'], [1, 2, 3, 4])),
    /* no N fall was kept (both rolls end kneeling): N plays the NE fall, the note's own free route */
    ...fall14(of14(HB('lord_krell'), 'death', ['sw', 'w', 'nw', 'ne', 'e']), of14(HB('lord_krell'), 'death2', ['s', 'se']),
      { n: { dir: `${HB('lord_krell')}/death/${NAME.ne}`, lay: SWING } }) } },
]);
