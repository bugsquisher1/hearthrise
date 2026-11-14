// tools/world-art/tileset.mjs — A PIXELLAB TOP-DOWN TILESET AS OUR wang16 TERRAIN (standard, pro and Tileset Pro's 25).
//
// PixelLab hands a tileset down as a sheet plus its metadata.json (the download beside the sheet: `tileset_data.tiles`; the
// GET /v2/tilesets/<id> answer carries each tile as its own image and no boxes, so it is refused by name): one row a
// tile with its four `corners` (lower | upper | transition), a `pattern_4x4` (the centre 2x2 is the corners, the ring is the
// cells round the tile, 255 = any) and its `bounding_box` on the sheet. Our terrain is the plain Wang-16: sixteen corner
// tiles keyed NW NE SW SE, '1' = the upper material (src/data/world/art-budget.js WANG_KEYS).
//
//   A flat set (transition_size 0 or 0.25) is those sixteen, in PixelLab's own order.
//   A TALL set (PixelLab 2026-11-11: pro at transition_size 0.5 and up, standard above 0.5) is 25 on a 4x8 sheet: the
//   sixteen, tiles with a `transition` corner (the wall face under a boundary) and four WALL TWINS that share their corners
//   with a plain tile and differ only in the ring. terrain.js draws no cliffs, so the reader takes the sixteen and names
//   the rest in the sidecar (`pixellab.ignored`), where a later cliff reader can find them.
//
// It never guesses. A key with two candidates takes the one whose ring is all wildcards (the plain tile); if that does not
// leave exactly one, it refuses and names them, and the importer's --pick KEY=TILE_NAME settles it by eye. A missing key,
// a tile of another size or a box off the sheet is refused too: a mis-read pair would tile wrong on every map that uses it.
//
// The tiles come off the sheet at the metadata's boxes (never a grid guess: a 4x4 and a 4x8 sheet read the same way), are
// never scaled or redrawn, and are laid in key order, eight a row. A sheet PixelLab drew on our palette is declared
// `native` (lock.mjs importMaterial): the lock then cannot re-grade it.
//
//   node tools/world-art/port-pixellab.mjs tileset --set S --id ID --meta META.json --file SHEET.png --lower MAT --upper MAT
//
// mutant-anchors: none — tests/world-assets.mjs --selftest plants every refusal on copies of a real pro tileset (rule [tileset])
import { createImage, blit } from './png.mjs';
import { importMaterial, paletteLocked } from './lock.mjs';
import { WANG_KEYS } from '../../src/data/world/art-budget.js';
import { PALETTE_ID } from './palette.mjs';

const CORNERS = ['NW', 'NE', 'SW', 'SE'];
const WILD = 255;

/** The tile rows of a PixelLab tileset's metadata (`tileset_data.tiles`). */
export function tileRows(meta) {
  const td = (meta && meta.tileset_data) || {};
  return Array.isArray(td.tiles) ? td.tiles : [];
}

/** A tile's Wang key, or null when a corner is neither terrain (a wall tile's `transition`). */
export function keyOf(tile) {
  const c = tile.corners || {};
  if (!CORNERS.every((k) => c[k] === 'lower' || c[k] === 'upper')) return null;
  return CORNERS.map((k) => (c[k] === 'upper' ? '1' : '0')).join('');
}

/** Is the tile's ring (every pattern cell outside the centre 2x2) all wildcards: a plain corner tile, good under any neighbours. */
export function plainRing(tile) {
  const p = tile.pattern_4x4;
  if (!p) return true;
  const rows = [p.row_0, p.row_1, p.row_2, p.row_3];
  if (!rows.every((r) => Array.isArray(r) && r.length === 4)) return false;
  return rows.every((r, y) => r.every((v, x) => ((y === 1 || y === 2) && (x === 1 || x === 2)) || v === WILD));
}

/**
 * The sixteen corner tiles of a PixelLab tileset.
 *   meta   the tileset answer            T     the grid's tile size
 *   sheet  { width, height } (optional): each chosen box must lie on it
 *   pick   { key: tile name } (optional): settles a key the ring cannot
 * -> { tiles: { key: { x, y, name } }, ignored: [tile name], total }. Throws naming every refusal at once.
 */
export function wangTiles(meta, { T = 32, sheet = null, pick = {} } = {}) {
  const rows = tileRows(meta), bad = [];
  if (!rows.length) throw new Error('no tiles in the metadata (tileset_data.tiles)' + (meta && meta.tileset ? ': this is the GET answer, pass the metadata.json downloaded beside the sheet' : ''));
  const by = {}, ignored = [];
  for (const t of rows) {
    const k = keyOf(t);
    if (k) (by[k] = by[k] || []).push(t); else ignored.push(t.name || String(t.id));
  }
  const tiles = {};
  for (const key of WANG_KEYS) {
    let list = by[key] || [];
    if (!list.length) { bad.push('no tile for corners ' + key); continue; }
    if (pick[key]) {
      const named = list.filter((t) => t.name === pick[key]);
      if (named.length !== 1) { bad.push('--pick ' + key + '=' + pick[key] + ' names ' + named.length + ' of ' + list.map((t) => t.name).join(', ')); continue; }
      list = named;
    } else if (list.length > 1) {
      const plain = list.filter(plainRing);
      if (plain.length !== 1) { bad.push('corners ' + key + ' fit ' + list.map((t) => t.name).join(' and ') + ' and the ring does not tell the plain one: --pick ' + key + '=<name>'); continue; }
      list = plain;
    }
    const t = list[0], b = t.bounding_box || {};
    for (const o of by[key]) if (o !== t) ignored.push(o.name || String(o.id));
    if (b.width !== T || b.height !== T) { bad.push((t.name || key) + ' is ' + b.width + 'x' + b.height + ', the grid\'s tile is ' + T + 'x' + T); continue; }
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.y < 0 || (sheet && (b.x + T > sheet.width || b.y + T > sheet.height))) { bad.push((t.name || key) + ' lies off the sheet (' + b.x + ',' + b.y + ')'); continue; }
    tiles[key] = { x: b.x, y: b.y, name: t.name || key };
  }
  if (bad.length) throw new Error(bad.join('; '));
  return { tiles, ignored: ignored.sort(), total: rows.length };
}

/**
 * A PixelLab tileset as a terrain source: { image, sidecar } for art/world/<set>/<id>.png and .json.
 *   o { id, meta, sheet, lower, upper, material?, pick?, note?, T? }: lower and upper are OUR material names for the pair
 *   (terrain.js reads them); `material` overrides the grade class of a sheet that is not palette-locked (default terrain).
 */
export function importTileset(o) {
  const T = o.T || 32, meta = o.meta || {};
  const got = wangTiles(meta, { T, sheet: o.sheet, pick: o.pick || {} });
  const image = createImage(8 * T, 2 * T), tiles = {};
  WANG_KEYS.forEach((k, n) => { blit(image, o.sheet, got.tiles[k].x, got.tiles[k].y, T, T, (n % 8) * T, (n >> 3) * T); tiles[k] = [[n % 8, n >> 3]]; });
  const gp = meta.generation_parameters || {}, base = meta.base_tile_ids || {};
  const asked = (gp.target_palette && gp.target_palette.name) || gp.palette_name || null;
  const locked = paletteLocked(image);
  const material = importMaterial(image, o.material || 'terrain');
  const pixellab = {
    tool: 'create_topdown_tileset', mode: gp.mode || 'standard', tileset: meta.id,
    ...(base.lower ? { lower_base_tile_id: base.lower } : {}), ...(base.upper ? { upper_base_tile_id: base.upper } : {}),
    transition_size: meta.transition_size || 0, tiles: got.total,
    ...(got.ignored.length ? { ignored: got.ignored } : {}),
    ...(asked ? { palette: asked } : {}), palette_locked: locked,
  };
  const sidecar = {
    id: o.id, class: 'terrain', kind: 'wang16', style: 's1', material, source: o.id + '.png', lower: o.lower, upper: o.upper, tiles, pixellab,
    notes: 'The ' + o.lower + '/' + o.upper + ' pair from PixelLab tileset ' + meta.id + ' (' + pixellab.mode + ', ' + got.total + ' tiles) by tools/world-art/port-pixellab.mjs tileset: its sixteen corner tiles cut at the metadata\'s boxes, pixels unscaled.'
      + (got.ignored.length ? ' ' + got.ignored.length + ' wall tiles left on the source sheet (terrain.js draws no cliffs).' : '')
      + (locked ? ' Every pixel came on ' + PALETTE_ID + ', so it is `native`: the lock does not grade it.' : (asked ? ' A palette was asked for but the sheet is not wholly on it, so the lock grades it as ' + material + '.' : ''))
      + (o.note ? ' ' + o.note : ''),
  };
  return { image, sidecar, ...got };
}
