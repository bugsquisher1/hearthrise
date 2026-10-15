// prototypes/world-shell/samples/make-frames.mjs — writes the two iron 9-slices of the chrome
// A/B (chrome-ab.css). PROTOTYPE ONLY. Run from the repo root: node prototypes/world-shell/samples/make-frames.mjs
// Colours are hr-world-56-v2 ramps (shadow, iron, steel), lit from the upper left like the world.
//   frame-iron.png       12x12, slice 4: windows and dialogs (8 px at x2)
//   frame-iron-thin.png   6x6,  slice 2: HUD widgets (4 px at x2)
import { writeFileSync } from 'node:fs';
import { createImage, encodePNG } from '../../../tools/world-art/png.mjs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C = { out: '#0b0a0c', lit: '#969aa1', mid: '#4a4d54', dark: '#2c2e33', rivet: '#c4ccd2' };

function frame(S) {
  const im = createImage(S, S);
  const put = (x, y, c) => im.data.set([...hex(c), 255], (y * S + x) * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (d === 0) put(x, y, C.out);
    else if (d === 1) put(x, y, (x === 1 || y === 1) && x < S - 2 && y < S - 2 ? C.lit : C.dark);
    else if (d === 2 && S >= 12) put(x, y, C.mid);
  }
  if (S >= 12) for (const [x, y] of [[2, 2], [S - 3, 2], [2, S - 3], [S - 3, S - 3]]) put(x, y, C.rivet);
  return encodePNG(im);
}
const here = new URL('.', import.meta.url);
writeFileSync(new URL('frame-iron.png', here), frame(12));
writeFileSync(new URL('frame-iron-thin.png', here), frame(6));
