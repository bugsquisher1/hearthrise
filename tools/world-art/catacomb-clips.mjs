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
]);
