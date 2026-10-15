// tools/world-art/registry.mjs — prints the World atlas registry table for ASSET_MANIFEST.md:
// one row per sidecar (art/world/<set>/*.json) with its built frame, clips and facings, the
// Art Director's decision (D below; default retain) and the PixelLab source. Read-only.
//   node tools/world-art/registry.mjs > table.md
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SETS = ['hero', 'cellar', 'town', 'home'];
// Decisions (Art Director, 2026-10-15; the R1/R3/R4 batch results landed the same day). Default: retain.
const D = {
  hero: ['edit', 'R1a done 2026-10-15: the south walk lifts both feet (free hand edit, 0 gens, saved to walk group `e0833032`); R2 done 2026-10-15: idle + walk on se/ne/nw/sw (idle v3 `23a56522`; walk se skeleton-v3 `c9540a39`, ne/nw/sw v3 `c67c844c`), 18 gens incl. 8 rejected; open: no hit clip, attack/down on the diagonals; approved: pending Tyler'],
  rat: ['edit', 'R3 done 2026-10-15: body edge 2.36 → 4.03:1 (min 3.76 over the 27 east frames), silhouette IoU ≥ 0.985, edit_image `4ef84f2b` + `f6a044fa`, 20 gens; open: idle is 1 still frame; approved: pending Tyler'],
  slime: ['edit', 'R3 done 2026-10-15: body edge 2.59 → 4.33:1 (min 3.68 over the 27 east frames), silhouette IoU ≥ 0.978, edit_image `99916c7b` + `5436c660`, 20 gens; open: idle is 1 still frame; approved: pending Tyler'],
  loot_bag: ['replace', 'R4 done 2026-10-15: a 14×14 tied burlap sack drawn by hand in palette (0 gens), body edge 1.06 → 3.21:1, lands beside the corpse; approved: pending Tyler'],
  hive_wasp: ['retain', 'body edge 4.67:1; idle is 1 still frame (add a wing-buzz idle later)'],
  npc_crier: ['edit', 'one still frame; needs a 4-frame idle (town life)'],
  npc_smith: ['edit', 'one still frame; needs a hammer loop (town life)'],
  peer_knight: ['edit', 'one still frame per facing; needs idle + walk to be a real peer'],
  peer_mage: ['edit', 'one still frame per facing; needs idle + walk'],
  peer_ranger: ['edit', 'one still frame per facing; needs idle + walk'],
  wall_torch: ['edit', 'still flame; needs a 4-frame flicker'],
  brazier: ['edit', 'still flame; needs a 4-frame flicker'],
  waterwheel: ['edit', 'still; needs a turning loop (the town\'s one big motion)'],
  well: ['retain', ''],
  cellar_floor: ['retain', 'unused today: the hunt floor is the flat cellar_earth fill (the flagstone patch read as a raised slab)'],
  town_ground: ['edit', 'one cobble fill with no wear, no edging and no square border: the "bland" town (after playable)'],
};
const rows = [];
for (const set of SETS) {
  const man = JSON.parse(readFileSync(ROOT + 'assets/world/atlas-' + set + '.json'));
  for (const f of readdirSync(ROOT + 'art/world/' + set).filter((x) => x.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(ROOT + 'art/world/' + set + '/' + f));
    const m = (man.sprites || {})[s.id] || (man.terrain || {})[s.id];
    const frame = m && m.frame ? m.frame.join('×') : (s.class === 'terrain' ? '32×32 tiles' : '');
    const anims = (s.anims || []).map((a) => a.name + ' ' + Math.max(...Object.values(a.dirs)) + (a.fps ? '@' + a.fps : '')).join(', ');
    const dirs = s.anims && s.anims.length ? Object.keys(s.anims[0].dirs).join('') : (s.class === 'terrain' ? '' : 's');
    const pl = s.pixellab || {};
    const tool = pl.character ? pl.character.tool : pl.object ? pl.object.tool : pl.tool || (pl.tileset ? pl.tileset.tool : '');
    const id = pl.character ? pl.character.id : pl.object ? pl.object.id : pl.id || (pl.tileset ? pl.tileset.id : '');
    const [dec, why] = D[s.id] || ['retain', ''];
    rows.push(`| ${s.id} | ${set} | ${s.class} | ${frame} | ${anims || 'still'} | ${dirs} | **${dec}**${why ? ': ' + why : ''} | ${tool || (s.pixellab ? 'see sidecar' : 'hand / script')}${id ? ' `' + String(id).slice(0, 8) + '`' : ''} |`);
  }
}
console.log('| id | set | class | frame | animation states (frames@fps) | facings | decision | source (PixelLab tool, id) |');
console.log('|---|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
console.error(rows.length + ' rows');
