// tools/world-art/registry.mjs — prints the World atlas registry table for ASSET_MANIFEST.md:
// one row per sidecar (art/world/<set>/*.json) with its built frame, clips and facings, the
// Art Director's decision (D below; default retain) and the PixelLab source. Read-only.
//   node tools/world-art/registry.mjs > table.md
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ATLAS_SETS } from '../../src/data/world/atlas-sets.js';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SETS = ATLAS_SETS;
// Decisions (Art Director). Default: retain. The 2026-10-15 rows were for the pre-style-1 sets, retired
// 2026-10-18 (tools/world-art/style1.mjs); every shipped asset is style 1 and starts at retain.
const D = {};
/* Hearth Square (lane/b-hearth-art, 2026-10-25): built into atlas-common, placed on no map yet; the
   build lane wires them after Tyler sees the mocks in art/review/hearth-square-2026-10-25/. */
for (const id of ['great_hearth', 'hearth_fire', 'hearth_fire_verdigris', 'hearth_flare', 'hearth_flare_verdigris',
  'hearth_burn_sparks', 'hearth_burn_sparks_verdigris', 'fuel_bone', 'fuel_lamp_jelly', 'fuel_dry_husk', 'fuel_pithwood',
  'fuel_log', 'fuel_coal', 'fuel_verdigris_cake', 'fuel_queens_comb', 'fuel_rat_kings_knot', 'fuel_den_knot',
  'fuel_mosslight_clump', 'square_dirt_flag', 'square_grass_flag', 'square_flag_hearthstone', 'square_bench_wood',
  'square_bench_stone', 'square_bench_log', 'square_decal_moss_a', 'square_decal_moss_b', 'square_decal_soot',
  'square_decal_leaves_a', 'square_decal_leaves_b', 'square_decal_puddle_a', 'square_decal_puddle_b',
  'square_decal_chips_a', 'square_decal_chips_b', 'square_decal_tuft_a', 'square_decal_tuft_b', 'square_general_store',
  'square_depot', 'square_bank', 'square_barracks', 'square_market_stall', 'mine_mouth', 'ore_copper_rock',
  'westwood_ash', 'fishing_pier']) D[id] = ['staged', 'on no map yet (Hearth Square, 2026-10-25); approved: art-director 2026-10-25, Tyler pending'];
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
