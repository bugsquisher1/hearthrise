// ════════════════════════════════════════════════════════════════════════
// tools/world-art/catacomb-clips.mjs — THE UNMARKED CATACOMBS' COMBAT CLIPS (data for import-clips.mjs, beside barrow-clips.mjs).
//
// The swings, falls and flinches of the Catacombs' five bodies (lane/a-catacomb-art, 2026-11-16). Only what the generation
// note KEPT: art/world-src/gen-2026-11-16/uc-note.json. A facing the note refused is ABSENT and the hunt's hook plays nothing
// there that is not drawn. Row shape: hunt-clips.mjs. Raw layout (the 11-14 one): <body>/<clip>/<facing>/f00.png … f06.png,
// f00 the still the clip started from (so it registers itself).
// ════════════════════════════════════════════════════════════════════════
import { NAME } from './hunt-clips.mjs';

const G16 = 'art/world-src/gen-2026-11-16/uc-bodies';
const ALL8 = ['s', 'e', 'n', 'w', 'se', 'sw', 'ne', 'nw'];
const SWING = [1, 2, 3, 4, 5, 6];       // a v3 clip less its still: six frames at 10 fps, the blow declared on index 3
const FLINCH = [0, 1, 2, 3, 4];         // the still and four frames, 12 fps, home by the engine

/* clip `src` of body `id` in `facings` */
const of = (id, src, facings, lay = SWING) => Object.fromEntries(facings.map((f) => [f, { dir: `${G16}/${id}/${src}/${NAME[f]}`, lay }]));
const swing = (...parts) => ({ attack: { fps: 10, hit: 3, dirs: Object.assign({}, ...parts) } });
const fall = (...parts) => ({ death: { fps: 10, dirs: Object.assign({}, ...parts) } });
const flinch = (...parts) => ({ hit: { fps: 12, dirs: Object.assign({}, ...parts) } });

export const CATACOMB_CLIPS = Object.freeze([
  /* the Shrouded Pauper: the shoulder lunge (attack2) in six facings, the head butt (attack3) in S and SE (SE's last two frames
     turn into a man in a shirt, so it swings 1-4 and back); the plain fall in five, the felled-post fall (death2) where the plain
     one stayed standing (E, NW) or baked a shadow (W) */
  { set: 'vaultdead', id: 'shrouded_pauper', clips: {
    ...swing(of('shrouded_pauper', 'attack2', ['e', 'n', 'w', 'sw', 'ne', 'nw']), of('shrouded_pauper', 'attack3', ['s']),
      of('shrouded_pauper', 'attack3', ['se'], [1, 2, 3, 4, 2, 1])),
    ...fall(of('shrouded_pauper', 'death', ['s', 'n', 'se', 'sw', 'ne']), of('shrouded_pauper', 'death2', ['e', 'w', 'nw'])),
    ...flinch(of('shrouded_pauper', 'hit', ALL8, FLINCH)) } },
  /* Keeper Dunn: the book blow (attack) S SE SW; seen from the side (attack2) E W; seen from behind (attack3) N NW, and NE's
     frames 1, 2 and 4 (a white rag shows on 3, 5 and 6). The plain fall in six; NE ends a frame early (a loose flame floats
     over him on the last), SW is death2 (the plain one kneels). The flinch: S, E, N swing out and home (frames 3-4 turn him
     into another man), NE is left to the engine's recoil (a white rag at his side). */
  { set: 'vaultdead', id: 'keeper_dunn', clips: {
    ...swing(of('keeper_dunn', 'attack', ['s', 'se', 'sw']), of('keeper_dunn', 'attack2', ['e', 'w']), of('keeper_dunn', 'attack3', ['n', 'nw']),
      of('keeper_dunn', 'attack3', ['ne'], [1, 2, 4, 4, 2, 1])),
    ...fall(of('keeper_dunn', 'death', ['s', 'e', 'n', 'w', 'se', 'nw']), of('keeper_dunn', 'death', ['ne'], [1, 2, 3, 4, 5, 5]),
      of('keeper_dunn', 'death2', ['sw'])),
    ...flinch(of('keeper_dunn', 'hit', ['s', 'e', 'n'], [0, 1, 2, 1, 0]), of('keeper_dunn', 'hit', ['w', 'se', 'sw', 'nw'], FLINCH)) } },
  /* the Night Carter: the hook jab (attack2) in six facings, re-rolled NW SW (attack3: the first jab drew two hooks in NW, a spark
     in SW); the first roll's swing turned the hook into a pick or a hammer and threw sparks. The fall backwards in seven (S from
     frame 2: frame 1 gives him a blank white face); N is the fall forward seen from behind (death2: the first stayed standing) */
  { set: 'vaultliving', id: 'night_carter', clips: {
    ...swing(of('night_carter', 'attack2', ['s', 'e', 'n', 'w', 'se', 'ne']), of('night_carter', 'attack3', ['sw', 'nw'])),
    ...fall(of('night_carter', 'death', ['s'], [2, 3, 4, 5, 6, 6]), of('night_carter', 'death', ['e', 'w', 'se', 'sw', 'ne', 'nw']), of('night_carter', 'death2', ['n'])),
    ...flinch(of('night_carter', 'hit', ALL8, FLINCH)) } },
  /* the Vault Leech: the rear-and-latch strike in seven facings, N re-rolled twice (a grey block, then white sparks) to a plain
     lunge (attack3). The fall is the roll belly-up and go limp (death2: the first roll barely moved, a dead leech read as a live
     one); its W and SW barely moved either, so they play E and SE flipped (a leech has no handedness). No NE flinch (a white puff). */
  { set: 'vaultliving', id: 'vault_leech', clips: {
    ...swing(of('vault_leech', 'attack', ['s', 'e', 'w', 'se', 'sw', 'ne', 'nw']), of('vault_leech', 'attack3', ['n'])),
    ...fall(of('vault_leech', 'death2', ['s', 'e', 'n', 'se', 'ne', 'nw']), { w: { mirror: 'e' }, sw: { mirror: 'se' } }),
    ...flinch(of('vault_leech', 'hit', ['s', 'e', 'n', 'w', 'se', 'sw', 'nw'], FLINCH)) } },
  /* the Bone Wall: the two-arm slam in six facings; S twice threw a white puff (frames 2-3), so it plays 1, 4 and back, the slam on
     frame 4; N is the one-arm club (attack2). It falls into a heap of skulls and lime in S E W SW, SE is SW flipped (a stuck-on skull
     face stood up in the plain one), NE NW come down from behind under the slab (death2). No N fall held in three rolls (a blue
     mist, legs splayed, standing), so N plays the NE heap, as Lord Krell's N plays his NE (barrow-clips.mjs). Flinch: N is left to
     the engine (white strike lines), NE and SW swing out and home (specks and an arc on frames 3-4). */
  { set: 'vaultdead', id: 'bone_wall', clips: {
    ...swing(of('bone_wall', 'attack', ['s'], [1, 1, 4, 4, 5, 6]), of('bone_wall', 'attack', ['e', 'w', 'se', 'sw', 'ne', 'nw']), of('bone_wall', 'attack2', ['n'])),
    ...fall(of('bone_wall', 'death', ['s', 'e', 'w', 'sw']), { se: { mirror: 'sw' } }, of('bone_wall', 'death2', ['ne', 'nw']),
      { n: { dir: `${G16}/bone_wall/death2/${NAME.ne}`, lay: SWING } }),
    ...flinch(of('bone_wall', 'hit', ['s', 'e', 'w', 'se', 'nw'], FLINCH), of('bone_wall', 'hit', ['ne', 'sw'], [0, 1, 2, 1, 0])) } },
]);
