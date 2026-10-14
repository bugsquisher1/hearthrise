// tools/world-art/palette.mjs — the world palette, read from its art asset
// (art/world/palette.json). The colours are art, like the pixels that use them, so
// they live with the art and not in UI code; the grading rules that map generated
// colour onto them are data (src/data/world/palette.js).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'art', 'world', 'palette.json');
const P = JSON.parse(readFileSync(FILE, 'utf8'));

export const PALETTE_ID = P.id;
/** Every colour, in ramp order. */
export const PALETTE = Object.freeze(Object.values(P.ramps).flat());
