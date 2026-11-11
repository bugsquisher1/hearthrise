// ════════════════════════════════════════════════════════════════════════
// tools/world-art/hunt-clips.mjs — WHICH REVIEWED CLIP FRAMES THE HUNT'S BODIES WEAR (data for import-clips.mjs).
//
// Only what the art director read and KEPT (art/briefs/gen-2026-11-07/13-next-batch.txt, both verdict rounds, and
// brief 13's own READY list; lane/a-hunt-clips 2026-11-10). Nothing here is generated: every row names raw frames
// already in art/world-src and the lay the verdict gave them. A facing a verdict refused or a batch still owes is simply
// ABSENT, and the hunt's hook plays nothing there that is not drawn (src/hunt-view/clip-hook.js H2).
//
// A row: { set, id, clips: { <clip>: { fps, hit?, replace?, dirs: { <facing>: SRC } } } }
//   SRC     { dir, still?, lay? }  `dir` the raw frames (0.png… or frame_000.png…), `still` the rotation they were drawn
//           from (the registration: its pixels are laid on the shipped idle frame 0 of the facing), `lay` the raw frame
//           indices in play order (default: every frame). Or { mirror: <facing> }: that facing's frames flipped, for a
//           one-way fall whose west the brief mirrors (brief 11 line 3), never a flinch or a swing.
//   replace  the clip's facings are exactly these (a scripted clip from derive-combat.mjs goes whole); without it,
//           the facings named replace or join the shipped ones and the rest stay.
// Deaths are SEATED by the import (the corpse's lowest row on the anchor row, the fall stepping down to it by whole
// pixels, never lifted), and each death facing gets its corpse frame (the fall's last frame, held).
// ════════════════════════════════════════════════════════════════════════
const B10 = 'art/world-src/gen-2026-11-08b';    // brief 10: the live 30's flinches (B3), the heroes' (H1)
const S11 = 'art/world-src/gen-2026-11-09';     // brief 11 samples: M1 first fights, M2 falls, M3 and H1d flinches
const B13 = 'art/world-src/gen-2026-11-09b';    // brief 13: Q1 sample, B3 first fights, Q4 sample, B6 falls

export const NAME = Object.freeze({ s: 'south', e: 'east', n: 'north', w: 'west', se: 'south-east', sw: 'south-west', ne: 'north-east', nw: 'north-west' });
const ALL = [0, 1, 2, 3, 4, 5];
const POSE_SWING = [0, 1, 2, 4, 2, 1];          // a pose-route S attack: still to blow and back, the blow on index 3
const HIT5 = [0, 1, 2, 3, 4];                   // brief 10 B3: a flinch keeps frames 0-4, 5 frames at 12 fps

/* brief 10 B3 / H1: the kept roll of each facing, frames 0-4 */
const flinch = (id, facings) => Object.fromEntries(facings.map((f) => [f, { dir: `${B10}/${id}-hit/hit/${NAME[f]}`, still: `${B10}/${id}-hit/${NAME[f]}.png`, lay: HIT5 }]));
/* brief 11 M3 / H1d samples: one diagonal flinch, frames 0-4 */
const flinchDiag = (sample, id, f, roll) => ({ [f]: { dir: `${S11}/${sample}/${id}/${roll}/hit/${NAME[f]}`, still: `${S11}/${sample}/${id}/${NAME[f]}.png`, lay: HIT5 } });
/* brief 13 B3 / Q1: a first fight's swing (src: attack, attack-fixed or attackpose) with its lay */
const swing = (batch, id, src, f, lay) => ({ [f]: { dir: `${B13}/${batch}/${id}/${src}/${NAME[f]}`, still: `${B13}/${batch}/${id}/${NAME[f]}.png`, lay } });
/* a seated fall from brief 13 (death-seated or deathpose-seated), optionally re-laid */
const fall = (batch, id, src, f, lay) => ({ [f]: { dir: `${B13}/${batch}/${id}/${src}/${NAME[f]}`, still: `${B13}/${batch}/${id}/${NAME[f]}.png`, ...(lay ? { lay } : {}) } });
const mirror = (pairs) => Object.fromEntries(pairs.map(([f, from]) => [f, { mirror: from }]));
const WEST = [['w', 'e'], ['sw', 'se'], ['nw', 'ne']];
const DIAG_WEST = [['sw', 'se'], ['nw', 'ne']];
/* brief 13 B6: the 23 drawn bodies' diagonal falls, plain (death-seated) or by the pose route (deathpose-seated) */
const b6 = (id, plain, pose = []) => Object.assign({}, ...plain.map((f) => fall('b6-fall-diagonals', id, 'death-seated', f)), ...pose.map((f) => fall('b6-fall-diagonals', id, 'deathpose-seated', f)));
const CARD = ['s', 'e', 'n', 'w'], DIAGS = ['se', 'sw', 'ne', 'nw'];

/* the hits of the live 30 at 12 fps; `facings` less the four the verdict dropped (slime S, rat N, grayjaw S and N) */
const hits = (id, facings = CARD, extra = {}) => ({ hit: { fps: 12, dirs: Object.assign(flinch(id, facings), extra) } });
/* a drawn body's four diagonal falls join its shipped s, e, n, w (fps 10, the shipped deaths') */
const falls = (dirs) => ({ death: { fps: 10, dirs } });

export const HUNT_CLIPS = Object.freeze([
  /* ── THE FIRST FIGHTS (Mill Cellar, the Sewer's kobolds and the Hive): drawn swings and falls replace the derived ones ── */
  { set: 'hunt', id: 'rat', clips: {
    ...hits('rat', ['s', 'e', 'w'], flinchDiag('m3-flinch-diagonals-sample', 'rat', 'se', 'm3')),
    attack: { fps: 10, hit: 3, replace: true, dirs: Object.assign(
      swing('q1-first-fights-sample', 'rat', 'attackpose', 's', POSE_SWING), swing('q1-first-fights-sample', 'rat', 'attack', 'n', ALL),
      { e: { dir: `${S11}/m1-first-fights-sample/rat/m1atk/attack/east`, still: `${S11}/m1-first-fights-sample/rat/east.png`, lay: ALL } },
      swing('b3-first-fights', 'rat', 'attack', 'w', ALL), swing('b3-first-fights', 'rat', 'attack', 'ne', [0, 0, 1, 2, 3, 4]),
      swing('b3-first-fights', 'rat', 'attack-fixed', 'nw', [1, 2, 3, 4, 5, 4]), swing('b3-first-fights', 'rat', 'attack', 'se', ALL),
      swing('b3-first-fights', 'rat', 'attack', 'sw', ALL)) },
    death: { fps: 10, replace: true, dirs: Object.assign(
      { s: { dir: `${S11}/m1-first-fights-sample/rat/m1deathpose/death/south`, still: `${S11}/m1-first-fights-sample/rat/south.png` } },
      fall('q1-first-fights-sample', 'rat', 'deathpose-seated', 'e'),
      fall('b3-first-fights', 'rat', 'deathpose-seated', 'n'), fall('b3-first-fights', 'rat', 'deathpose-seated', 'se'), fall('b3-first-fights', 'rat', 'deathpose-seated', 'ne'),
      mirror(WEST)) },
  } },
  { set: 'hunt', id: 'cistern_spider', clips: {
    ...hits('cistern_spider'),
    attack: { fps: 10, hit: 3, replace: true, dirs: Object.assign(
      swing('b3-first-fights', 'cistern_spider', 'attackpose', 's', POSE_SWING), swing('q1-first-fights-sample', 'cistern_spider', 'attack', 'e', ALL),
      swing('b3-first-fights', 'cistern_spider', 'attack', 'n', ALL), swing('b3-first-fights', 'cistern_spider', 'attack', 'w', [0, 0, 0, 1, 2, 3]),
      swing('b3-first-fights', 'cistern_spider', 'attack', 'ne', ALL), swing('b3-first-fights', 'cistern_spider', 'attack', 'nw', [0, 0, 1, 2, 3, 4]),
      swing('b3-first-fights', 'cistern_spider', 'attack', 'se', [0, 0, 0, 1, 2, 3]), swing('b3-first-fights', 'cistern_spider', 'attack', 'sw', ALL)) },
    death: { fps: 10, replace: true, dirs: Object.assign(
      { s: { dir: `${S11}/m1-first-fights-sample/cistern_spider/m1deathpose/death/south` } },
      ...['e', 'n', 'ne'].map((f) => fall('b3-first-fights', 'cistern_spider', 'deathpose-seated', f)),
      /* se frame 1 splays its legs below the still's foot row while its body stands 6 px up: no whole-pixel seat meets
         validate.mjs [feet] and [below-anchor] both, so the import lays it 0 2 3 4 5 6 (the flip goes on) */
      fall('b3-first-fights', 'cistern_spider', 'deathpose-seated', 'se', [0, 2, 3, 4, 5, 6]), mirror(WEST)) },
  } },
  { set: 'hunt', id: 'culvert_bat', clips: {
    ...hits('culvert_bat'),
    attack: { fps: 10, hit: 3, replace: true, dirs: Object.assign(
      swing('b3-first-fights', 'culvert_bat', 'attack-fixed', 'e', [0, 0, 1, 2, 3, 4]), swing('b3-first-fights', 'culvert_bat', 'attack-fixed', 'w', ALL),
      swing('b3-first-fights', 'culvert_bat', 'attack', 's', [0, 0, 1, 2, 3, 4]), swing('b3-first-fights', 'culvert_bat', 'attack', 'n', ALL),
      swing('b3-first-fights', 'culvert_bat', 'attack', 'se', [0, 0, 1, 2, 3, 4]), swing('b3-first-fights', 'culvert_bat', 'attack', 'sw', ALL),
      swing('b3-first-fights', 'culvert_bat', 'attack', 'ne', ALL), swing('b3-first-fights', 'culvert_bat', 'attack', 'nw', ALL)) },
    death: { fps: 10, replace: true, dirs: Object.assign(
      fall('q1-first-fights-sample', 'culvert_bat', 'death-seated', 's'),
      ...['e', 'n', 'se'].map((f) => fall('b3-first-fights', 'culvert_bat', 'death-seated', f)),
      fall('b3-first-fights', 'culvert_bat', 'deathpose-seated', 'ne'), mirror(WEST)) },
  } },
  { set: 'mill', id: 'hive_wasp', clips: {
    ...hits('hive_wasp'),
    attack: { fps: 10, hit: 3, replace: true, dirs: Object.assign(
      swing('q1-first-fights-sample', 'hive_wasp', 'attack-fixed', 'e', ALL),
      swing('b3-first-fights', 'hive_wasp', 'attack-fixed', 'w', [0, 0, 1, 2, 3, 4]), swing('b3-first-fights', 'hive_wasp', 'attack-fixed', 's', [0, 0, 1, 2, 3, 4]),
      swing('b3-first-fights', 'hive_wasp', 'attack-fixed', 'n', [0, 0, 1, 2, 3, 4]), swing('b3-first-fights', 'hive_wasp', 'attack-fixed', 'se', ALL),
      swing('b3-first-fights', 'hive_wasp', 'attack-fixed', 'sw', ALL), swing('b3-first-fights', 'hive_wasp', 'attack-fixed', 'ne', ALL),
      swing('b3-first-fights', 'hive_wasp', 'attack-fixed', 'nw', ALL)) },
    death: { fps: 10, replace: true, dirs: Object.assign(
      fall('b3-first-fights', 'hive_wasp', 'death-seated', 's'),
      ...['e', 'n', 'se', 'ne'].map((f) => fall('b3-first-fights', 'hive_wasp', 'deathpose-seated', f)), mirror(WEST)) },
  } },
  { set: 'hunt', id: 'kobold_tosher', clips: {
    ...hits('kobold_tosher'),
    attack: { fps: 10, hit: 3, replace: true, dirs: Object.assign(
      swing('q1-first-fights-sample', 'kobold_tosher', 'attack', 'e', [3, 2, 1, 0, 1, 2]),
      swing('b3-first-fights', 'kobold_tosher', 'attackpose', 's', POSE_SWING),
      ...['n', 'nw', 'sw', 'w'].map((f) => swing('b3-first-fights', 'kobold_tosher', 'attack', f, [1, 2, 3, 4, 5, 4])),
      swing('b3-first-fights', 'kobold_tosher', 'attack', 'ne', ALL), swing('b3-first-fights', 'kobold_tosher', 'attack', 'se', ALL)) },
    death: { fps: 10, replace: true, dirs: Object.assign(
      fall('q1-first-fights-sample', 'kobold_tosher', 'death-seated', 's'),
      ...['e', 'n', 'w', 'se', 'sw', 'ne', 'nw'].map((f) => fall('b3-first-fights', 'kobold_tosher', 'death-seated', f))) },
  } },
  /* the rat king's S swing is owed (B3k, re-animated after the round 2 read): none is drawn there, so S and its
     diagonals' neighbours fall to the drawn SE and SW (one 45° step, clip-hook.js H2) */
  { set: 'hunt', id: 'rat_king', clips: {
    ...hits('rat_king'),
    attack: { fps: 10, hit: 3, replace: true, dirs: Object.assign(
      swing('b3-first-fights', 'rat_king', 'attack', 'e', [0, 1, 1, 4, 5, 5]), swing('b3-first-fights', 'rat_king', 'attack', 'se', [0, 1, 1, 3, 5, 5]),
      ...['n', 'w', 'ne', 'nw', 'sw'].map((f) => swing('b3-first-fights', 'rat_king', 'attack', f, ALL))) },
    death: { fps: 10, replace: true, dirs: Object.assign(
      fall('q1-first-fights-sample', 'rat_king', 'death-seated', 's'),
      ...['e', 'n', 'w', 'se', 'sw'].map((f) => fall('b3-first-fights', 'rat_king', 'death-seated', f)),
      fall('b3-first-fights', 'rat_king', 'deathpose-seated', 'ne'), fall('b3-first-fights', 'rat_king', 'deathpose-seated', 'nw')) },
  } },
  /* the slime's N swing is owed (B3n: its back grew a face); its S flinch was dropped (it stretches into a point) */
  { set: 'hunt', id: 'slime', clips: {
    ...hits('slime', ['e', 'n', 'w'], flinchDiag('m3-flinch-diagonals-sample', 'slime', 'ne', 'm3')),
    attack: { fps: 10, hit: 3, replace: true, dirs: Object.assign(
      ...[['e', [0, 0, 1, 2, 3, 4]], ['s', [0, 0, 1, 2, 3, 4]], ['sw', [0, 0, 1, 2, 3, 4]], ['w', ALL], ['ne', ALL], ['nw', ALL], ['se', ALL]]
        .map(([f, lay]) => swing('b3-first-fights', 'slime', 'attack', f, lay))) },
    death: { fps: 10, replace: true, dirs: Object.assign(
      fall('q1-first-fights-sample', 'slime', 'deathpose-seated', 's'),
      fall('b3-first-fights', 'slime', 'deathpose-seated', 'e', [0, 4, 5, 6]), fall('b3-first-fights', 'slime', 'deathpose-seated', 'n', [0, 1, 5, 6]),
      fall('b3-first-fights', 'slime', 'deathpose-seated', 'se'), fall('b3-first-fights', 'slime', 'deathpose-seated', 'ne'), mirror(WEST)) },
  } },

  /* ── THE SEWER AND WICKSTEAD: their west falls mirror the east (brief 11 line 3), so do the new diagonals ── */
  { set: 'sewer', id: 'drain_rat', clips: { ...hits('drain_rat'), ...falls(Object.assign(
    { se: { dir: `${S11}/m2-fall-diagonals-sample/drain_rat/m2pose/death/south-east`, still: `${S11}/m2-fall-diagonals-sample/drain_rat/south-east.png` } },
    b6('drain_rat', [], ['ne']), mirror(DIAG_WEST))) } },
  { set: 'sewer', id: 'sump_slime', clips: { ...hits('sump_slime'), ...falls(Object.assign(b6('sump_slime', [], ['se', 'ne']), mirror(DIAG_WEST))) } },
  { set: 'stead', id: 'barn_spider', clips: { ...hits('barn_spider'), ...falls(Object.assign(b6('barn_spider', [], ['se', 'ne']), mirror(DIAG_WEST))) } },
  { set: 'stead', id: 'barn_wasp', clips: { ...hits('barn_wasp'), ...falls(Object.assign(b6('barn_wasp', [], ['se', 'ne']), mirror(DIAG_WEST))) } },
  { set: 'stead', id: 'granary_rat', clips: { ...hits('granary_rat'), ...falls(Object.assign(b6('granary_rat', [], ['se', 'ne']), mirror(DIAG_WEST))) } },
  { set: 'stead', id: 'turncoat', clips: { ...hits('turncoat'), ...falls(b6('turncoat', DIAGS)) } },

  /* ── MEADOWBROOK THICKET ── */
  { set: 'forest', id: 'briarcoat_wolf', clips: { ...hits('briarcoat_wolf'), ...falls(b6('briarcoat_wolf', DIAGS)) } },
  { set: 'forest', id: 'dire_gray', clips: { ...hits('dire_gray'), ...falls(b6('dire_gray', DIAGS)) } },
  { set: 'forest', id: 'grayjaw', clips: { ...hits('grayjaw', ['e', 'w']), ...falls(b6('grayjaw', DIAGS)) } },
  { set: 'forest', id: 'gray_whelp', clips: { ...hits('gray_whelp'), ...falls(b6('gray_whelp', DIAGS)) } },
  { set: 'forest', id: 'gray_wolf', clips: { ...hits('gray_wolf', CARD, flinchDiag('m3-flinch-diagonals-sample', 'gray_wolf', 'sw', 'm3')), ...falls(Object.assign(
    b6('gray_wolf', ['nw', 'sw']),
    ...['se', 'ne'].map((f) => ({ [f]: { dir: `${S11}/m2-fall-diagonals-sample/gray_wolf/m2/death/${NAME[f]}`, still: `${S11}/m2-fall-diagonals-sample/gray_wolf/${NAME[f]}.png` } })))) } },
  { set: 'forest', id: 'orchard_boar', clips: { ...hits('orchard_boar'), ...falls(Object.assign(b6('orchard_boar', ['ne', 'nw', 'sw']),
    fall('q4-fall-diagonals-sample', 'orchard_boar', 'death-seated', 'se'))) } },

  /* ── MOSSLIGHT GLADE ── */
  { set: 'glade', id: 'brook_bear', clips: { ...hits('brook_bear'), ...falls(b6('brook_bear', ['se', 'sw'], ['ne', 'nw'])) } },
  { set: 'glade', id: 'carrion_crow', clips: { ...hits('carrion_crow'), ...falls(Object.assign(b6('carrion_crow', [], ['ne', 'nw', 'sw']),
    fall('q4-fall-diagonals-sample', 'carrion_crow', 'deathpose-seated', 'se'))) } },
  { set: 'glade', id: 'glade_poacher', clips: { ...hits('glade_poacher', CARD, flinchDiag('m3-flinch-diagonals-sample', 'glade_poacher', 'se', 'm3')), ...falls(Object.assign(
    b6('glade_poacher', ['ne', 'nw']),
    ...['se', 'sw'].map((f) => ({ [f]: { dir: `${S11}/m2-fall-diagonals-sample/glade_poacher/m2/death/${NAME[f]}`, still: `${S11}/m2-fall-diagonals-sample/glade_poacher/${NAME[f]}.png` } })))) } },
  { set: 'glade', id: 'goblin_sluicer', clips: { ...hits('goblin_sluicer'), ...falls(b6('goblin_sluicer', DIAGS)) } },
  { set: 'glade', id: 'rook_poacher', clips: { ...hits('rook_poacher'), ...falls(b6('rook_poacher', DIAGS)) } },
  { set: 'glade', id: 'walking_vine', clips: { ...hits('walking_vine'), ...falls(b6('walking_vine', ['ne', 'nw', 'sw'], ['se'])) } },

  /* ── THE WARRENS ── */
  { set: 'warren', id: 'chief_coppercap', clips: { ...hits('chief_coppercap'), ...falls(b6('chief_coppercap', DIAGS)) } },
  { set: 'warren', id: 'goblin_digger', clips: { ...hits('goblin_digger', CARD, flinchDiag('m3-flinch-diagonals-sample', 'goblin_digger', 'nw', 'm3')), ...falls(Object.assign(
    b6('goblin_digger', ['ne', 'nw', 'sw']), fall('q4-fall-diagonals-sample', 'goblin_digger', 'death-seated', 'se'))) } },
  { set: 'warren', id: 'goblin_scavenger', clips: { ...hits('goblin_scavenger'), ...falls(b6('goblin_scavenger', DIAGS)) } },
  { set: 'warren', id: 'goblin_skulker', clips: { ...hits('goblin_skulker'), ...falls(b6('goblin_skulker', DIAGS)) } },
  { set: 'warren', id: 'hobgoblin_foreman', clips: { ...hits('hobgoblin_foreman'), ...falls(b6('hobgoblin_foreman', DIAGS)) } },

  /* ── THE HEROES: H1's flinch in s, e, n, w (the druid has none east or north), H1d's three sampled diagonals ── */
  ...['knight', 'ranger', 'sorcerer', 'witch', 'brute', 'berserker', 'dawnward', 'druid'].map((o) => ({ set: 'heroes', id: 'outfit_' + o, clips: {
    hit: { fps: 12, dirs: Object.assign(flinch('outfit_' + o, o === 'druid' ? ['s', 'w'] : CARD),
      o === 'knight' ? flinchDiag('h1d-hero-flinch-diagonals-sample', 'outfit_knight', 'se', 'h1d') : {},
      o === 'ranger' ? flinchDiag('h1d-hero-flinch-diagonals-sample', 'outfit_ranger', 'sw', 'h1d') : {},
      o === 'sorcerer' ? flinchDiag('h1d-hero-flinch-diagonals-sample', 'outfit_sorcerer', 'nw', 'h1d') : {}) },
  } })),
]);
