// ════════════════════════════════════════════════════════════════════════
// tools/pack/art.mjs — A GROUND'S ART LIST, READ FROM ITS ROWS (lane/b-ground-art-pipeline, 2026-11-13).
//
//   node tools/pack.mjs art <ground> [--write]
//
// "New ground = data rows + one art pass": the art pass's list is not written by hand. This reads the ground's own rows (its
// map, pockets, hunt, monsters, their drops and spells), its region kit (src/data/world/region-kits.js) and what the tree
// already draws (assets/world manifests, the pixel icons), and answers every piece the ground needs as HAVE or OWED, each
// owed piece with the PixelLab tool and mode that makes it today (docs/PIXELLAB_WORKFLOW.md §1, §5b, §7, the 2026-11-11
// update: pro tilesets on the sticky palette, the pro path set and building kit, the free vfx_workbench for spell effects).
//
// It is a SKELETON: the list, the tool, the fixed parameters, the import command and a generation estimate. The words a
// model is prompted with, the references and the accept criteria are the art director's, written into it; nothing here
// calls PixelLab, and nothing is generated before a sample is read (CLAUDE.md §10: one sample a kind, then the batch).
//
//   artList(d)        pure: the rows { part, id, state: 'have' | 'part' | 'owed', recipe?, note }
//   briefText(list)   the skeleton as text, in the shape of art/briefs/*
//   loadArtData(root) what artList reads, from one tree
//   artSelftest()     every open ground owes no floor, prop or body (what ships is drawn), and each planted gap is listed
//                     with its tool (run by `node tools/pack.mjs --selftest`)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FACINGS = ['s', 'e', 'n', 'w', 'se', 'sw', 'ne', 'nw'], CARDINALS = ['s', 'e', 'n', 'w'];
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const ofPiece = (id, sig) => id === sig || id.startsWith(sig + '_');

/* THE TOOL FOR EACH KIND OF PIECE (docs/PIXELLAB_WORKFLOW.md is the write-up; this is the one table a brief is cut from).
   gens [lo, hi] are PixelLab's stated prices and our own measured batches (§5b, §5c), an estimate until a batch is billed.
   `palette: true` passes hr-world-56-v2 (the line is printed once a brief), so the art comes back on the palette and its
   import declares `native` (tools/world-art/lock.mjs importMaterial): the lock then never re-grades it. */
export const RECIPES = Object.freeze({
  floor: { tool: 'Map Workshop paint + view_map', gens: [0, 0], palette: false,
    call: 'paint the layout from the family\'s tilesets (no generation when the family has every pair the layout meets)',
    into: 'node tools/world-art/port-pixellab.mjs map --set <set> --id <ground>_ground --map <map id> --size W,H --crop X,Y,FILE' },
  tileset_pro: { tool: 'create_topdown_tileset', gens: [15, 15], palette: true,
    call: 'mode: "pro", tile_size: 32, view: "high top-down", transition_size: 0, max_colors: 12; BOTH halves new: no lower_base_tile_id / upper_base_tile_id with a palette (brief 14: a chained base is recoloured); name the ramp in the words (the palette picks its own nearest)',
    into: 'node tools/world-art/port-pixellab.mjs tileset --set <set> --id <lower>_<upper> --meta <tileset>.json --file <sheet>.png --lower <mat> --upper <mat>' },
  paths: { tool: 'create_path_tiles (the Create tiles (Pro) road set)', gens: [15, 25], palette: true,
    call: 'tile_type: "square_topdown", tile_size: 32 (the only size it takes), outline_mode: "segmentation" (clean seams); 18 connectable pieces; 15 at the default view angle, 25 straight down',
    into: 'a decal sheet: node tools/world-art/port-pixellab.mjs sheet --set <set> --file <sheet>.png --cell 32 --items "<id>:decal:terrain,…"' },
  building: { tool: 'create_building_kit (the Create tiles (Pro) building kit)', gens: [10, 10], palette: true,
    call: 'tile_type: "square_topdown", tile_size: 32, layout: "grid", outline_mode: "segmentation"; REFERENCE ONLY: our walls are custom slices the Asset Director fits (WORKFLOW §1)',
    into: 'a handoff to the Asset Director; nothing is imported from the kit as it comes' },
  prop_sheet: { tool: 'create_1_direction_object', gens: [10, 25], palette: true,
    call: 'size 42 or less, style_images: up to 8 shipped props of this kit (cropped to their opaque box), one call returns 64 candidates: pass each wanted piece several times and pick',
    into: 'node tools/world-art/port-pixellab.mjs sheet --set <set> --file <sheet>.png --image <image id> --cell 64 --items "<id>:<class>:<material>,…"' },
  signature: { tool: 'create_map_object (or create_object_pro_flash, n_directions: 1)', gens: [5, 40], palette: true,
    call: 'create_map_object with background_image + inpainting when it must fit one spot of the painted floor; else Pro Flash, one direction, high top-down; a signature is a small family of variants of ONE idea',
    into: 'node tools/world-art/port-pixellab.mjs object --set <set> --id <id> --class <class> --file <png> --object <object id>' },
  body_object: { tool: 'create_object_pro_flash, then animate_object v3', gens: [38, 40], palette: false,
    call: 'first frame n_directions: 1 (5; read it before paying for more), rotations from first_frame_url (1), v3 walk 8 and attack 8, idle frame_count 8 keeping 2 (8), an edited dead pose (5) as end_frame for the fall of the cardinals (3). Canvas 40 gives a 34-38 px body. v3 clips take no palette (animate_object pro does, at 10-25 a facing against 1: not worth it), so its ramps are named at import',
    into: 'node tools/world-art/port-pixellab.mjs unit --set <set> --id <id> --class <class> --dir <dir> --object <object id> --ramps <its ramps> [--lift 1], then idle --clip <dir>' },
  body_character: { tool: 'create_character, then animate_character v3', gens: [30, 55], palette: true,
    call: 'view: "high top-down", size 40, a straight-south reference of a kit body for identity; mode: "pro" takes the palette (untested by us on a character: ONE sample first, WORKFLOW §7), v3 does not. Clips: v3 custom action_description, one direction a call, the same words every facing: idle (8, keep 2), walk 8, attack 8, death in the cardinals',
    into: 'node tools/world-art/port-pixellab.mjs unit --set <set> --id <id> --class character --dir <dir> --object <character id> --ramps <its ramps>' },
  clips: { tool: 'animate_object v3 / animate_character v3', gens: [1, 8], palette: false,
    call: 'the missing clips only, 1 a facing; the sidecar\'s own action_description, copied',
    into: 'node tools/world-art/import-clips.mjs (or port-pixellab.mjs idle --clip <dir>)' },
  icons: { tool: 'create_1_direction_object', gens: [10, 10], palette: true,
    call: 'size 32, style_images: shipped icons of the same family, item_descriptions: each owed line three or four times; a 32 px call bills 10 for 64 slots whatever fills them, so one call carries about 16 lines',
    into: 'assets/icons-bundle/pixel/items/<id>.png and pixel/heads/<monster>.png, then node tests/pixel-icons.mjs' },
  vfx: { tool: 'vfx_workbench (free)', gens: [0, 0], palette: false,
    call: 'presets and layers, exported as a sheet; no paid VFX artist without a sample (WORKFLOW §7). The spell\'s MARK on the floor is engine-drawn (marks.js): this is only the hit on the struck unit',
    into: 'art/world/vfx/<fx id>.png + sidecar class vfx (the lock snaps it), then its row in src/data/hunt-vfx.js HIT_FX' },
});

const PARTS = Object.freeze(['tiles', 'props', 'bodies', 'icons', 'effects']);
/* legend materials that are a laid road: an unpainted floor that walks one is offered the connectable road set */
const ROADS = Object.freeze(['cobble', 'setts', 'road', 'track', 'causeway']);
const HUMAN = new Set(['human', 'humanoid']);

/** Every monster a ground places or its hunt can spawn, a boss's wave (`adds`) and its keyed hall's room rows (`hall`, the room's ground
    row: src/data/hunt-grounds.js HALL_GROUNDS) included, sorted. */
function monstersOf(ground, hunt, hall) {
  const ids = new Set();
  for (const g of [ground, hall]) for (const p of (g && g.pockets) || []) for (const s of [...(p.pack || []), ...(p.spawns || []), ...(p.adds || [])]) ids.add(s.monster);
  for (const s of (hunt && hunt.spawns) || []) ids.add(s.monster);
  return [...ids].sort();
}

/** The clips of the live-ground contract a drawn body lacks (tests/world-assets.mjs rule [live]). */
function missingClips(sprite) {
  const a = sprite.anims || {}, out = [];
  const has = (clip, d) => !!(a[clip] && a[clip].dirs && a[clip].dirs[d]);
  for (const clip of ['idle', 'walk']) { const m = FACINGS.filter((d) => !has(clip, d)); if (m.length) out.push(clip + ' ' + m.join(',')); }
  if (!a.attack || !Object.values(a.attack.dirs || {}).some(Boolean)) out.push('attack');
  for (const clip of ['death', 'corpse']) { const m = CARDINALS.filter((d) => !has(clip, d)); if (m.length) out.push(clip + ' ' + m.join(',')); }
  return out;
}

/**
 * The ground's art, piece by piece.
 * d { gid, ground, hunt, map, monsters, kits, sprites: id -> { set, class, anims }, terrains: id -> set, artAlias, nodeKinds,
 *     spells, hitFx: element -> fx id, hasItemIcon(id), hasHeadIcon(id) }
 * -> { gid, name, band, region, family, signature, rows: [{ part, id, state, recipe?, note }] }
 */
export function artList(d) {
  const rows = [];
  const add = (part, id, state, note, recipe = null) => rows.push({ part, id, state, note, ...(recipe ? { recipe } : {}) });
  const kitId = Object.keys(d.kits).find((k) => own(d.kits[k].grounds, d.gid)) || null;
  const kit = kitId ? d.kits[kitId] : null, mine = kit ? kit.grounds[d.gid] : null;
  const fam = kit && mine ? kit.families[mine.family] : null;
  const map = d.map || { objects: [] };

  /* TILES: the region, the painted floor, the family it is painted from */
  if (!kit) add('tiles', d.gid, 'owed', 'no region kit claims this ground: add it to src/data/world/region-kits.js (its family, its one or two signature pieces) before any art');
  const mats = [...new Set(Object.values(map.legend || {}))];
  const walks = mats.length ? '; the layout walks ' + mats.join(', ') : '';
  const painted = !!map.ground && own(d.terrains, map.ground);
  if (!map.ground) add('tiles', d.gid + '_ground', 'owed', 'the map row names no ground: the floor is painted, then named there' + walks, 'floor');
  else if (painted) add('tiles', map.ground, 'have', 'painted floor, set ' + d.terrains[map.ground]);
  else add('tiles', map.ground, 'owed', 'the map names it and no loaded set carries it' + walks, 'floor');
  const roads = mats.filter((m) => ROADS.includes(m));
  if (!painted && roads.length) add('tiles', 'roads', 'owed', 'the layout walks ' + roads.join(', ') + ': a connectable road set, unless the family already paints it', 'paths');
  if (fam) {
    const nT = Object.keys(fam.terrains).length, nS = fam.tilesets.length;
    if (!nS && !fam.maps.length) add('tiles', mine.family + ' family', 'owed', 'the family has no tileset and no map: its first pair', 'tileset_pro');
    else add('tiles', mine.family + ' family', 'have', nT + ' terrains, ' + nS + ' tilesets, ' + fam.maps.length + ' Map Workshop map(s): a pair the layout meets and the family lacks is one more tileset_pro');
  }
  if ((map.buildings || []).length) add('tiles', 'buildings', 'part', (map.buildings || []).length + ' building(s) on the map: walls are fitted by the Asset Director', 'building');

  /* PROPS: every piece the map places, its gather nodes' two states, and the signature pieces it declares */
  const placed = new Set((map.objects || []).map((o) => o.id)), nodes = new Set();
  for (const n of ((d.ground.gather || {}).nodes || [])) { const k = d.nodeKinds[n.node]; if (k) for (const id of [k.sprite, k.spent]) if (id) { placed.add(id); nodes.add(id); } }
  const sig = mine ? mine.signature : [];
  for (const s of sig) if (![...placed].some((p) => ofPiece(p, s))) placed.add(s);
  for (const id of [...placed].sort()) {
    const isSig = sig.some((s) => ofPiece(id, s));
    const inKit = !!kit && (kit.props.includes(id) || isSig || nodes.has(id));
    const tag = (isSig ? 'signature' : kit && kit.props.includes(id) ? 'kit prop' : 'gather node') + (kit && kit.pending.includes(id) ? ', pending: a brief exists in art/briefs/' : '');
    if (own(d.sprites, id)) add('props', id, 'have', (inKit ? tag : 'NOT in the region kit (rule [kit] place): add it to the kit or swap it') + ', set ' + d.sprites[id].set);
    else add('props', id, 'owed', inKit ? tag : 'not in the region kit either: a kit prop (shared by the region) or one of this ground\'s ' + (sig.length ? 'signature pieces' : 'two signature slots'), isSig ? 'signature' : 'prop_sheet');
  }

  /* BODIES: each monster's drawing through a whole kill */
  const mons = monstersOf(d.ground, d.hunt, d.hall);
  const kitBodies = kit ? kit.units.filter((u) => own(d.sprites, u)) : [];
  for (const id of mons) {
    const art = (d.artAlias && d.artAlias[id]) || id, row = d.monsters[id] || {};
    const who = (row.name || id) + (row.boss ? ', the boss' : '') + (art !== id ? ', drawn as ' + art : '');
    if (!own(d.sprites, art)) {
      add('bodies', id, 'owed', who + ': ' + (HUMAN.has(row.cls) ? 'a person' : 'a creature') + (kitBodies.length ? '; or a re-pour of a kit body (' + kitBodies.slice(0, 6).join(', ') + (kitBodies.length > 6 ? ', …' : '') + '), at most 3 of the ground\'s bodies' : ''),
        HUMAN.has(row.cls) ? 'body_character' : 'body_object');
      continue;
    }
    const miss = missingClips(d.sprites[art]);
    if (miss.length) add('bodies', id, 'part', who + ', set ' + d.sprites[art].set + ', lacks ' + miss.join('; '), 'clips');
    else add('bodies', id, 'have', who + ', set ' + d.sprites[art].set);
  }

  /* ICONS: each monster's head, each drop */
  const drops = new Set();
  for (const id of mons) {
    add('icons', 'head ' + id, d.hasHeadIcon(id) ? 'have' : 'owed', 'the monster\'s face in Hunts and the bestiary', d.hasHeadIcon(id) ? null : 'icons');
    for (const dr of (d.monsters[id] || {}).drops || []) drops.add(dr.id);
  }
  for (const id of [...drops].sort()) add('icons', id, d.hasItemIcon(id) ? 'have' : 'owed', 'a drop', d.hasItemIcon(id) ? null : 'icons');

  /* EFFECTS: each spell's hit, by its element */
  const seen = new Set();
  for (const id of mons) for (const sp of (d.monsters[id] || {}).spells || []) {
    if (seen.has(sp)) continue;
    seen.add(sp);
    const row = d.spells[sp] || {}, el = row.element || null, fx = el ? d.hitFx[el] : null;
    const name = (row.n || sp) + ' (' + (d.monsters[id].name || id) + ')';
    if (!el) add('effects', sp, 'have', name + ': no element, the role\'s hit plays; its mark is engine-drawn');
    else if (fx && own(d.sprites, fx)) add('effects', sp, 'have', name + ': ' + el + ' plays ' + fx + '; its mark is engine-drawn');
    else add('effects', sp, 'owed', name + ': element ' + el + ' has no hit effect' + (fx ? ' drawn (' + fx + ')' : ' row in hunt-vfx.js HIT_FX.element'), 'vfx');
  }
  return { gid: d.gid, name: (d.hunt && d.hunt.name) || d.gid, band: (d.hunt && d.hunt.band) || null, region: kitId, family: mine ? mine.family : null, signature: sig, rows };
}

/** The generations the owed rows come to, [lo, hi]: icons by the call (16 lines each), every other row its own. */
export function estimate(list) {
  let lo = 0, hi = 0;
  const owed = list.rows.filter((r) => r.state !== 'have' && r.recipe);
  const icons = owed.filter((r) => r.recipe === 'icons').length;
  for (const r of owed) if (r.recipe !== 'icons') { lo += RECIPES[r.recipe].gens[0]; hi += RECIPES[r.recipe].gens[1]; }
  const calls = Math.ceil(icons / 16);
  return [lo + calls * RECIPES.icons.gens[0], hi + calls * RECIPES.icons.gens[1]];
}

const HEAD = { tiles: 'TILES', props: 'PROPS', bodies: 'CREATURE BODIES AND CLIPS', icons: 'ICONS', effects: 'EFFECTS' };

/** The skeleton as text. `palette` { id, colours } prints the sticky-palette line once. */
export function briefText(list, palette) {
  const L = [];
  const owed = list.rows.filter((r) => r.state !== 'have');
  const [lo, hi] = estimate(list);
  L.push('ART LIST: ' + list.name.toUpperCase() + ' (' + list.gid + (list.band ? ', Levels ' + list.band.join('-') : '') + '). A skeleton cut from the ground\'s rows by');
  L.push('  node tools/pack.mjs art ' + list.gid + '. The art director writes the words, references and accept lines into it.');
  L.push('Region kit: ' + (list.region ? list.region + ', tile family ' + list.family + ', signature ' + (list.signature.join(', ') || 'none yet (two slots)') : 'NONE (see TILES)') + '.');
  L.push('Owed: ' + owed.length + ' of ' + list.rows.length + ' pieces, about ' + (lo === hi ? lo : lo + '-' + hi) + ' generations by the tool prices (an estimate; read get_balance before and after).');
  L.push('Law: style 1 only, never beside older art; one grid, one palette, one high top-down view (docs/ART_DIRECTION.md).');
  L.push('  ONE SAMPLE A KIND, read at x2 on its ground, before any batch (CLAUDE.md §10). Free first for a fix to shipped art (WORKFLOW §4b).');
  for (const part of PARTS) {
    const mine = list.rows.filter((r) => r.part === part);
    if (!mine.length) continue;
    L.push('');
    L.push(HEAD[part] + ' (' + mine.filter((r) => r.state !== 'have').length + ' owed of ' + mine.length + ')');
    for (const r of mine.filter((x) => x.state !== 'have' || part === 'tiles')) L.push('  ' + (r.state === 'have' ? 'have' : r.state === 'part' ? 'PART' : 'OWED') + '  ' + r.id.padEnd(26) + ' ' + r.note + (r.recipe ? '  -> ' + r.recipe : ''));
    /* what is drawn already is one wrapped line of ids (a note only where it warns): the list is for what is owed */
    const have = part === 'tiles' ? [] : mine.filter((x) => x.state === 'have').map((x) => x.id.replace(/^head /, 'head:') + (/NOT in the region kit/.test(x.note) ? ' (NOT IN THE KIT)' : ''));
    let line = '  have  ';
    for (const id of have) { if (line.length + id.length > 116) { L.push(line.trimEnd()); line = '        '; } line += id + ' '; }
    if (have.length) L.push(line.trimEnd());
  }
  const used = [...new Set(owed.map((r) => r.recipe).filter(Boolean))];
  if (used.length) {
    L.push('');
    L.push('HOW EACH IS MADE (docs/PIXELLAB_WORKFLOW.md §1, §5b, §7)');
    for (const k of used) {
      const r = RECIPES[k];
      L.push('  ' + k + ': ' + r.tool + ', ' + (r.gens[1] ? (r.gens[0] === r.gens[1] ? r.gens[0] : r.gens.join('-')) + ' gens' : 'no generation') + (r.palette ? ', PALETTE' : ''));
      L.push('    call   ' + r.call);
      L.push('    words  <art director: the prompt, the references, what to reject on sight>');
      L.push('    accept <art director: measured on the locked pixels, and the x2 read on the ground>');
      L.push('    import ' + r.into);
    }
    if (palette && used.some((k) => RECIPES[k].palette)) {
      L.push('');
      L.push('PALETTE (every call marked PALETTE; the import then declares `native` and the lock does not grade it):');
      L.push('  palette_name: "' + palette.id + '", palette: ' + JSON.stringify(palette.colours));
    }
    L.push('');
    L.push('AFTER THE IMPORT: node tools/world-art/build.mjs --set <set>, node tests/world-assets.mjs (exit 0), the set\'s row in');
    L.push('  src/data/world/atlas-sets.js, the pieces off `pending` in region-kits.js, then this command again: it must owe nothing.');
  }
  return L.join('\n') + '\n';
}

/** What artList reads, from one tree. */
export async function loadArtData(root = ROOT) {
  const v = (p) => pathToFileURL(join(root, p)).href;
  const G = await import(v('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(v('src/data/hunts.js'));
  const { MONSTERS } = await import(v('src/data/monsters.js'));
  const { mapRowOf } = await import(v('src/data/world/maps/index.js'));
  const { REGION_KITS } = await import(v('src/data/world/region-kits.js'));
  const { LOADED_SETS, MASK_SETS } = await import(v('src/data/world/atlas-sets.js'));
  const { atlasPaths } = await import(v('src/data/world/art-budget.js'));
  const { HUNT_ART_ALIAS } = await import(v('src/data/monster-art.js'));
  const { PIXEL_DIR } = await import(v('src/data/item-art.js'));
  const { MONSTER_SPELLS } = await import(v('src/data/monster-spells.js'));
  const { HIT_FX } = await import(v('src/data/hunt-vfx.js'));
  const P = await import(v('tools/world-art/palette.mjs'));
  const sprites = {}, terrains = {};
  for (const set of LOADED_SETS) {
    if (MASK_SETS[set]) continue;
    const f = join(root, atlasPaths(set).manifest);
    if (!existsSync(f)) continue;
    const m = JSON.parse(readFileSync(f, 'utf8'));
    for (const [id, s] of Object.entries(m.sprites)) sprites[id] = { set, class: s.class, anims: Object.fromEntries(Object.entries(s.anims).map(([n, a]) => [n, { dirs: Object.fromEntries(Object.entries(a.dirs).map(([dd, l]) => [dd, l.length])) }])) };
    for (const id of Object.keys(m.terrain)) terrains[id] = set;
  }
  const files = (dir) => new Set(existsSync(join(root, dir)) ? readdirSync(join(root, dir)) : []);
  const items = files(PIXEL_DIR), heads = files(PIXEL_DIR.replace(/items\/$/, 'heads/'));
  return { G, HUNT_INDEX, MONSTERS, mapRowOf, kits: REGION_KITS, sprites, terrains, artAlias: HUNT_ART_ALIAS, nodeKinds: G.GROUND_NODE_KINDS,
    spells: MONSTER_SPELLS, hitFx: HIT_FX.element, hasItemIcon: (id) => items.has(id + '.png'), /* a body that wears another's sprite wears its head too (monster-art.js headPathFor) */
    hasHeadIcon: (id) => heads.has((Object.prototype.hasOwnProperty.call(HUNT_ART_ALIAS, id) ? HUNT_ART_ALIAS[id] : id) + '.png'),
    palette: { id: P.PALETTE_ID, colours: P.PALETTE } };
}

/** artList's input for ground `gid` of loaded data D (null when there is no such ground). */
export function inputOf(gid, D, over = {}) {
  const ground = own(D.G.HUNT_GROUNDS, gid) ? D.G.HUNT_GROUNDS[gid] : null;
  if (!ground) return null;
  /* the ground's keyed hall, when its pack carries one: its boss and adds are drawn like any body (Krell's Hall) */
  const hall = Object.values(D.G.HALL_GROUNDS || {}).find((h) => h.hall === gid) || null;
  return { gid, ground, hall, hunt: D.HUNT_INDEX[ground.hunt], map: D.mapRowOf(ground.map), monsters: D.MONSTERS, kits: D.kits, sprites: D.sprites, terrains: D.terrains,
    artAlias: D.artAlias, nodeKinds: D.nodeKinds, spells: D.spells, hitFx: D.hitFx, hasItemIcon: D.hasItemIcon, hasHeadIcon: D.hasHeadIcon, ...over };
}

/* --selftest: answers the list of failures (empty = green) and prints each case. */
export async function artSelftest(log = console.log) {
  const D = await loadArtData(), bad = [];
  /* what ships is drawn: an OPEN ground owes no floor, prop or body (tests/world-assets.mjs holds the art; this holds the reader) */
  for (const gid of Object.keys(D.G.OPEN_GROUNDS)) {
    const owed = artList(inputOf(gid, D)).rows.filter((r) => r.state !== 'have' && ['tiles', 'props', 'bodies'].includes(r.part) && r.recipe !== 'building');
    if (owed.length) bad.push('art: open ground ' + gid + ' reads as owing ' + owed.map((r) => r.part + ' ' + r.id).join(', '));
  }
  const gid = 'wickstead', base = inputOf(gid, D), mon = monstersOf(base.ground, base.hunt)[0];
  const art = (D.artAlias[mon]) || mon;
  const spelled = Object.keys(D.MONSTERS).find((m) => (D.MONSTERS[m].spells || []).length && monstersOf(base.ground, base.hunt).includes(m));
  const without = (o, k) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));
  const cases = [
    ['a monster no set draws is an owed body with its tool', { sprites: without(D.sprites, art) }, (l) => l.rows.some((r) => r.part === 'bodies' && r.id === mon && r.state === 'owed' && /^body_/.test(r.recipe))],
    ['a body with no fall is PART, owing the clips', { sprites: { ...D.sprites, [art]: { ...D.sprites[art], anims: without(D.sprites[art].anims, 'death') } } }, (l) => l.rows.some((r) => r.id === mon && r.state === 'part' && r.recipe === 'clips' && /death/.test(r.note))],
    ['a placed piece no set draws is an owed prop sheet', { map: { ...base.map, objects: base.map.objects.concat([{ id: 'zz_new_piece', x: 1, y: 1 }]) } }, (l) => l.rows.some((r) => r.id === 'zz_new_piece' && r.state === 'owed' && r.recipe === 'prop_sheet')],
    ['a floor no set carries is owed', { terrains: without(D.terrains, base.map.ground) }, (l) => l.rows.some((r) => r.part === 'tiles' && r.id === base.map.ground && r.state === 'owed' && r.recipe === 'floor')],
    ['an unpainted floor that walks a road is offered the pro road set, with the layout\'s materials', { terrains: without(D.terrains, base.map.ground), map: { ...base.map, legend: { ...base.map.legend, ':': 'cobble' } } },
      (l) => l.rows.some((r) => r.id === 'roads' && r.recipe === 'paths') && l.rows.some((r) => r.recipe === 'floor' && /walks .*cobble/.test(r.note)) && /create_path_tiles/.test(briefText(l, D.palette))],
    ['a ground no region kit claims says so first', { kits: {} }, (l) => l.region === null && l.rows[0].part === 'tiles' && l.rows[0].state === 'owed' && /region kit/.test(l.rows[0].note)],
    ['a family with no tileset owes a PRO tileset on the palette, imported native', { kits: { k: { ...D.kits.greenhaven, families: { ...D.kits.greenhaven.families, meadow: { terrains: {}, tilesets: [], maps: [] } } } } },
      (l) => l.rows.some((r) => r.recipe === 'tileset_pro' && r.state === 'owed') && /mode: "pro"/.test(briefText(l, D.palette)) && briefText(l, D.palette).includes('palette_name: "' + D.palette.id + '"') && /port-pixellab\.mjs tileset/.test(briefText(l, D.palette))],
    ['a spell whose element has no hit effect is owed from the free workbench', spelled ? { hitFx: {}, spells: { ...D.spells, [D.MONSTERS[spelled].spells[0]]: { ...D.spells[D.MONSTERS[spelled].spells[0]], element: 'ember' } } } : null,
      (l) => l.rows.some((r) => r.part === 'effects' && r.state === 'owed' && r.recipe === 'vfx') && estimate({ rows: l.rows.filter((r) => r.part === 'effects') })[1] === 0],
    ['a drop with no icon and a monster with no head are owed in one icons call', { hasItemIcon: () => false, hasHeadIcon: () => false },
      (l) => { const n = l.rows.filter((r) => r.part === 'icons' && r.state === 'owed').length; return n > 1 && estimate({ rows: l.rows.filter((r) => r.part === 'icons') })[0] === Math.ceil(n / 16) * 10; }],
  ];
  for (const [what, over, test] of cases) {
    if (!over) { bad.push('art: harness, ' + gid + ' has no monster with a spell for: ' + what); continue; }
    const hit = test(artList(inputOf(gid, D, over)));
    log('  ' + (hit ? 'ok ' : 'RED') + ' art list: ' + what);
    if (!hit) bad.push('art: ' + what + ' is not listed');
  }
  return { bad, cases: cases.length };
}
