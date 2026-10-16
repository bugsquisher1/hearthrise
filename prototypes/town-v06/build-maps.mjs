#!/usr/bin/env node
// prototypes/town-v06/build-maps.mjs — Town v0.6 district maps from Tyler's blueprint v0.5.
// Writes <id>.js (town_common.js row format), needs-art.json, and lints every map with
// src/world/core/map-compile.js against the live atlases.
//   node prototypes/town-v06/build-maps.mjs [--root <repo>]
// PROPOSED material: 'water' ('~', solid). It is NOT in src/data/world/terrain.js yet;
// the lint runs with it injected and needs-art.json lists it. Everything else is live data.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ai = process.argv.indexOf('--root');
const ROOT = ai > 0 ? resolve(process.argv[ai + 1]) : resolve(HERE, '..', '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const mapc = await imp('src/world/core/map-compile.js');
const terrain = await imp('src/data/world/terrain.js');
const sets = (await imp('src/data/world/atlas-sets.js')).ATLAS_SETS;
const sprites = {}, terrains = {};
for (const s of sets) {
  const m = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + s + '.json'), 'utf8'));
  Object.assign(sprites, m.sprites); Object.assign(terrains, m.terrain || {});
}
const PROPOSED_MATERIALS = { water: { solid: true } };
const tables = { materials: { ...terrain.MATERIALS, ...PROPOSED_MATERIALS }, sprites, openClasses: terrain.OPEN_CLASSES,
  treeClasses: terrain.TREE_CLASSES, lights: terrain.LIGHTS, terrains };
const LEGEND = { '.': 'grass', ':': 'cobble', '=': 'earth', '#': 'planks', '^': 'rock', '~': 'water' };
const needsArt = [];
// --art: place the sprites the art/town-v06 branch made instead of their stand-ins.
const ART = process.argv.includes('--art');
const MADE = { fountain: 'fountain', market_stall: 'market_stall', fence_wood: 'fence_wood', estate_gate: 'estate_gate', bank_sign: 'bank_sign', depot_sign: 'depot_sign' };
const OUT = ART ? join(ROOT, 'prototypes/town-v06') : HERE;

function district(id, name, w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const d = { id, name, w, h, g, objects: [], buildings: [], exits: [], plots: [], labels: [], stations: {}, start: null, want: [] };
  d.fill = (ch, x, y, rw, rh) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (i >= 0 && j >= 0 && i < w && j < h) g[j][i] = ch; };
  d.line = (ch, pts, wd = 1) => {           // orthogonal polyline, width wd (winding lanes)
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const x0 = Math.min(ax, bx), y0 = Math.min(ay, by);
      d.fill(ch, x0, y0, Math.abs(bx - ax) + wd, Math.abs(by - ay) + wd);
    }
  };
  d.bld = (bid, x, y, bw, bh, wall, door, opt = {}) => {
    d.buildings.push({ id: bid, rect: [x, y, bw, bh], wall, floor: 'plank_floor', doors: [door],
      windows: opt.windows || [x + 1, x + bw - 2].filter((v) => v !== door[0]),
      chimney: opt.chimney === undefined ? null : opt.chimney,
      closed: true, roof: { rect: [x, y, bw, bh], kind: opt.roof || (wall === 'timber' ? 'roof_wood' : 'roof_slate') } });
    d.labels.push([opt.label || bid, x, y, bw, bh, opt.tint || (wall === 'timber' ? 'timber' : 'stone')]);
  };
  d.obj = (oid, x, y) => d.objects.push({ id: oid, x, y });
  d.need = (oid, x, y, why) => {
    if (ART && MADE[oid] && sprites[MADE[oid]]) { d.made = d.made || []; d.made.push([oid, x, y]); return; }
    needsArt.push({ id: oid, map: id, x, y, why }); d.want.push([oid, x, y]); };
  return d;
}

// ═══ 1. THE COMMON MARKET (with the Gatehouse) — 64 x 48 ═══════════════════════════
const M = district('the_common_market', 'The Common — Market & Gatehouse', 64, 48);
M.fill('~', 6, 0, 4, 48);                                   // the Hearth river, west side
M.fill('#', 5, 24, 6, 3);                                    // the river bridge (planks)
M.line('=', [[0, 25], [12, 25]], 1);                         // west road to the Crooked Shacks
M.line(':', [[11, 24], [22, 24]], 3);                        // bridge → plaza
M.fill(':', 29, 0, 5, 1); M.line(':', [[30, 5], [30, 16]], 3); // gate road south to the plaza
M.fill(':', 22, 16, 22, 16);                                 // THE PLAZA heart
M.fill('.', 22, 16, 2, 2); M.fill('.', 42, 30, 2, 2);        // soften two plaza corners
M.fill(':', 22, 13, 14, 3); M.fill(':', 35, 13, 21, 3);      // the High Row in front of bank/depot/store
M.line(':', [[44, 25], [62, 25]], 3);                        // east road to the town edge
M.line(':', [[31, 32], [31, 47]], 3);                        // south road to the harbour
// Gatehouse (north wall, the arrival): pass-through door north and south
M.bld('gatehouse_w', 25, 0, 5, 5, 'stone_house', [27, 4], { label: 'Gatehouse', windows: [26] });
M.bld('gatehouse_e', 33, 0, 5, 5, 'stone_house', [35, 4], { label: 'Gatehouse', windows: [36] });
M.fill(':', 30, 0, 3, 6);
M.need('gate_arch', 30, 0, 'gatehouse arch spanning the 3-tile gateway between the two towers (3x1 raised)');
M.start = [31, 7];
M.exits.push({ x: 31, y: 0, to: 'kingsroad_north' }, { x: 0, y: 25, to: 'crooked_shacks' },
  { x: 63, y: 26, to: 'town_edge' }, { x: 32, y: 47, to: 'harbor_waterfront' });
// Services on the High Row, 3–9 tiles from the gate
M.bld('bank', 24, 7, 5, 5, 'stone_house', [26, 11], { label: 'Bank', chimney: 25 });
M.fill(':', 24, 12, 6, 1);
M.bld('depot', 36, 8, 7, 5, 'timber', [39, 12], { label: 'Depot', chimney: 41 });
M.bld('general_store', 45, 8, 7, 5, 'timber', [48, 12], { label: 'General Store', chimney: 46 });
M.bld('guard_barracks', 54, 7, 8, 6, 'stone_house', [57, 12], { label: 'Guard Barracks' });
// Market hall moved to the plaza's EAST edge, door onto the plaza
M.bld('market_hall', 45, 17, 11, 7, 'stone_house', [45, 20], { label: 'Market Hall', chimney: 53 });
M.fill(':', 44, 16, 13, 1);
// The plaza: well (fountain wanted), stalls ring, lamps, benches, crier
if (!ART) M.obj('well', 32, 23); M.need('fountain', 32, 23, 'plaza centrepiece; the well stands in until it exists (2x2 stone fountain)');
M.obj('statue', 28, 20); M.obj('statue', 37, 20);
for (const [x, y] of [[25, 18], [40, 18], [25, 29], [40, 29], [30, 15], [34, 15]]) M.obj('lamppost', x, y);
M.obj('bench', 29, 27); M.obj('bench', 34, 27); M.obj('npc_crier', 30, 21); M.obj('noticeboard', 35, 21);
const stalls = [[24, 20], [24, 23], [24, 26], [41, 21], [41, 24], [41, 27], [27, 30], [32, 30], [37, 30]];
stalls.forEach(([x, y], i) => { M.need('market_stall', x, y, 'awning stall ' + (i + 1) + ' of 9 ringing the plaza (2x1)');
  if (!ART) M.obj(['apple_crate', 'crate', 'barrel', 'sack_stack', 'crate_stack', 'grain_sack', 'apple_crate', 'barrel_banded', 'crate'][i], x, y); });
M.obj('signpost', 33, 8); M.obj('lamppost', 29, 6); M.obj('lamppost', 34, 6);
M.need('bank_sign', 26, 11, 'hanging coin sign over the bank door'); M.need('depot_sign', 39, 12, 'hanging crate sign over the depot door');
// P07 — EA riverside home, east bank south of the bridge
M.bld('home_p07', 11, 31, 6, 5, 'timber', [14, 35], { label: 'P07 (EA) riverside', tint: 'ea', chimney: 15 });
M.line('=', [[14, 36], [14, 38], [20, 38], [20, 33], [22, 33]], 1);
M.obj('flower_bed', 12, 37); M.obj('barrel_planter', 16, 37);
M.plots.push({ slot: 'P07', ea: true, building: 'home_p07', tier: 'riverside' });
// HIGH-END: Gatewarden's Close — walled garden estate just west of the gate
M.bld('estate_gatewarden', 13, 3, 7, 5, 'stone_house', [16, 7], { label: "Gatewarden's Close", tint: 'fancy', chimney: 18 });
for (let x = 11; x <= 22; x++) { if (x !== 16) M.obj('hedge', x, 13); if (x !== 16) M.need('garden_wall', x, 13, 'low stone garden wall (hedge stands in)'); }
for (let y = 1; y <= 12; y++) M.obj('hedge', 22, y);
M.need('estate_gate', 16, 13, 'private iron garden gate, the Close\'s frontage');
M.line('=', [[16, 8], [16, 14]], 1); M.line(':', [[16, 14], [16, 15], [22, 15]], 1);
for (const [x, y] of [[13, 9], [14, 9], [18, 9], [19, 9], [13, 11], [19, 11]]) M.obj('flower_bed', x, y);
M.obj('bench', 17, 11); M.obj('oak', 13, 2); M.obj('young_oak', 20, 2);
M.plots.push({ slot: 'P_HE4', highEnd: true, building: 'estate_gatewarden', site: 'walled garden estate beside the gate', frontage: 'private gate + formal garden' });
// HIGH-END: Overmarket Rise — up the east hill, looking down on the plaza
M.fill('=', 47, 30, 1, 1);
M.line('=', [[46, 32], [46, 36], [49, 36], [49, 40]], 1);
M.bld('estate_overmarket', 50, 37, 8, 5, 'stone_house', [53, 41], { label: 'Overmarket Rise', tint: 'fancy', chimney: 56 });
M.fill('#', 50, 42, 8, 2); M.need('terrace_rail', 50, 43, 'stone terrace balustrade along the Rise frontage (8 tiles)');
M.need('hill_slope_edge', 46, 33, 'grass hill rim / slope edge to read as raised ground over the market');
M.line('=', [[49, 40], [49, 42]], 1);
M.plots.push({ slot: 'P_HE5', highEnd: true, building: 'estate_overmarket', site: 'hilltop over the market', frontage: 'terrace overlooking the plaza' });
// Gardens + fences in the big grass patches
for (let x = 45; x <= 61; x += 1) M.need('fence_wood', x, 46, 'picket fence run along the south lots');
for (const [x, y] of [[36, 36], [38, 36], [40, 36], [36, 38], [38, 38], [40, 38]]) M.obj('flower_bed', x, y);
M.need('veg_patch', 37, 40, 'allotment vegetable rows (decal 3x2)');
M.obj('barrel_planter', 35, 40); M.obj('woodpile', 24, 38); M.obj('firewood', 26, 38); M.obj('bush', 22, 36);
// the orchard west of the plaza, allotments by the river, hedgerows north of the High Row
for (let x = 12; x <= 20; x += 3) for (let y = 17; y <= 22; y += 3) M.obj('young_oak', x, y);
M.obj('apple_crate', 14, 21); M.obj('apple_crate', 17, 18);
for (let x = 12; x <= 20; x += 1) M.need('fence_wood', x, 16, 'orchard fence along the estate wall');
for (const [x, y] of [[12, 41], [15, 41], [18, 41], [12, 44], [15, 44], [18, 44]]) M.need('veg_patch', x, y, 'riverside allotments (decal 2x1)');
for (const [x, y] of [[11, 40], [21, 40], [11, 46], [21, 46]]) M.obj('hedge', x, y);
M.obj('barrel_planter', 20, 43); M.obj('woodpile', 13, 46);
for (let x = 39; x <= 61; x += 1) if (x % 5) M.obj('hedge', x, 2);
for (const [x, y] of [[41, 4], [47, 4], [53, 4], [59, 4]]) M.obj('flower_bed', x, y);
for (const [x, y] of [[35, 43], [37, 43], [39, 43], [41, 43], [36, 45], [40, 45]]) M.obj(['bush', 'flower_bed'][x % 2], x, y);
M.obj('bench', 26, 42); M.obj('lamppost', 30, 40); M.obj('lamppost', 34, 36);
M.stations = { combat: [38, 23], gather: [33, 20], artisan: [44, 22], idle: [30, 28] };

// ═══ 2. CROOKED SHACKS — 48 x 32 ═══════════════════════════════════════════════════
const S = district('crooked_shacks', 'Crooked Shacks', 48, 32);
// woodlot on the west edge (x 0..5)
for (let y = 1; y < 31; y += 2) { S.obj(y % 4 === 1 ? 'oak' : 'pine', 1, y); if (y % 6 === 3) S.obj('oak', 4, y); else S.obj('pine', 3, y + 1 < 31 ? y : y - 1); }
S.obj('woodpile', 6, 14); S.obj('chopping_block', 7, 16); S.obj('firewood', 6, 18);
S.labels.push(['Woodlot', 0, 0, 6, 32, 'wood']);
// winding lanes that jog and dead-end
S.line('=', [[47, 16], [40, 16], [40, 13], [33, 13], [33, 17], [26, 17], [26, 12], [19, 12], [19, 15], [9, 15]], 2);
S.line('=', [[33, 13], [33, 6], [29, 6], [29, 3]], 1);          // jogs north, dead-ends at P03
S.line('=', [[19, 12], [19, 8], [14, 8], [14, 5]], 1);           // to P01/P02, dead end
S.line('=', [[26, 18], [26, 22], [22, 22], [22, 26], [16, 26]], 1); // south dog-leg, dead-ends at the sewer
S.line('=', [[40, 18], [40, 24], [36, 24]], 1);                 // spur to the training yard
S.line('=', [[9, 16], [9, 22], [12, 22]], 1);                    // woodlot track, dead end
const sh = (slot, x, y, door) => { S.bld('home_' + slot.toLowerCase(), x, y, 5, 4, 'timber', door, { label: slot + (slot === 'P03' ? ' (EA)' : ''), tint: slot === 'P03' ? 'ea' : 'timber' }); };
sh('P01', 11, 3, [13, 6]); sh('P02', 17, 2, [19, 5]); sh('P03', 27, 1, [29, 4]);
S.line('=', [[19, 6], [19, 8]], 1); S.line('=', [[13, 7], [14, 7]], 1);
sh('P04', 12, 17, [14, 17]); S.line('=', [[14, 16], [14, 16]], 1);
sh('P05', 21, 6, [23, 9]); S.line('=', [[23, 10], [23, 12]], 1);
sh('P06', 29, 19, [31, 19]); S.line('=', [[31, 18], [31, 18]], 1);
S.plots.push({ slot: 'P03', ea: true, building: 'home_p03', tier: 'shack' });
S.bld('smithy', 36, 2, 7, 5, 'timber', [39, 6], { label: 'Smithy', chimney: 41 });
S.line('=', [[39, 7], [39, 13]], 1);
S.obj('anvil', 37, 8); S.obj('npc_smith', 41, 8); S.obj('firewood', 43, 9);
S.bld('sewer_works', 11, 24, 6, 5, 'stone_house', [16, 26], { label: 'Sewer Works' });
S.obj('hatch', 18, 27);
S.bld('training_yard', 30, 25, 8, 5, 'timber', [35, 25], { label: 'Training Yard' }); // fenced yard: needs-art
S.need('fence_wood', 30, 24, 'yard fence instead of a roofed hall (straight run 8 tiles)');
for (const [x, y] of [[16, 9], [24, 4], [33, 9], [44, 20], [20, 20], [37, 15]]) S.obj('bush', x, y);
for (const [x, y] of [[9, 4], [24, 15], [42, 13], [27, 28], [45, 28]]) S.obj('barrel_planter', x, y);
for (const [x, y] of [[44, 24], [44, 26], [42, 26]]) S.obj('flower_bed', x, y);
S.need('veg_patch', 43, 24, 'shack allotment (decal 3x2)'); S.need('fence_wood', 42, 23, 'allotment fence');
S.need('washing_line', 25, 10, 'shack clutter: washing line between P05 and the lane');
S.obj('sack_lying', 10, 9); S.obj('barrel_broken', 34, 20); S.obj('crate', 21, 14);
S.exits.push({ x: 47, y: 16, to: 'the_common_market' });
S.start = [45, 16];
S.stations = { combat: [36, 22], gather: [7, 20], artisan: [44, 12], idle: [28, 14] };

// ═══ 3. HARBOR WATERFRONT — 48 x 32 ════════════════════════════════════════════════
const H = district('harbor_waterfront', 'Harbour Waterfront', 48, 32);
H.fill('~', 6, 0, 4, 22);                                    // river continues from the market
H.fill('~', 3, 5, 12, 11);                                   // widens into the weir pool
H.fill('.', 6, 7, 7, 7);                                     // Weir Isle
H.fill('~', 0, 22, 48, 10);                                  // the sea
H.fill('#', 0, 21, 30, 2);                                    // the quay
H.fill('#', 18, 23, 3, 6); H.fill('#', 26, 23, 3, 5);         // two fishing piers
H.line(':', [[16, 0], [16, 4], [24, 4], [24, 20]], 3);        // road down from the market
H.line(':', [[12, 18], [44, 18]], 2);
// HIGH-END: Weir Isle House — on the river island, footbridge only
H.bld('estate_weir_isle', 7, 8, 5, 4, 'stone_house', [9, 11], { label: 'Weir Isle House', tint: 'fancy' });
H.fill('#', 13, 10, 3, 1); H.line('=', [[16, 10], [16, 6]], 1);
H.need('footbridge_rail', 12, 10, 'rope rail for the private footbridge to Weir Isle');
H.obj('flower_bed', 7, 13); H.obj('flower_bed', 11, 13); H.obj('young_oak', 12, 13);
H.plots.push({ slot: 'P_HE3', highEnd: true, building: 'estate_weir_isle', site: 'river island in the weir pool', frontage: 'private footbridge + island garden' });
// HIGH-END: Saltjetty House — on its own jetty out over the sea
H.fill('#', 36, 20, 2, 4); H.fill('#', 34, 24, 10, 7);
H.bld('estate_saltjetty', 35, 25, 7, 4, 'timber', [38, 25], { label: 'Saltjetty House', tint: 'fancy', roof: 'roof_slate' });
H.need('jetty_piles', 34, 30, 'timber piles under the jetty edge; sea-facing deck rail');
H.need('mooring_boat', 44, 27, 'moored rowing boat at the private dock');
H.plots.push({ slot: 'P_HE2', highEnd: true, building: 'estate_saltjetty', site: 'private jetty over the open sea', frontage: 'dock + mooring' });
H.bld('harbor_office', 27, 9, 7, 5, 'stone_house', [30, 13], { label: 'Harbour Office' });
H.bld('guild_hall', 35, 8, 9, 6, 'stone_house', [39, 13], { label: 'Guild Hall', chimney: 42 });
H.bld('fisher_guild', 12, 16, 6, 4, 'timber', [14, 19], { label: "Fishers' Guild" });
H.bld('home_p13', 34, 1, 5, 4, 'timber', [36, 4], { label: 'P13' }); H.line('=', [[36, 5], [36, 7]], 1);
H.bld('home_p14', 40, 1, 5, 4, 'timber', [42, 4], { label: 'P14' }); H.line('=', [[42, 5], [42, 7]], 1);
H.line('=', [[26, 6], [44, 6]], 1);
for (const [x, y] of [[20, 20], [22, 20], [28, 20], [31, 20]]) H.obj(['barrel', 'crate_stack', 'sack_pile', 'barrel_banded'][x % 4], x, y);
H.need('net_rack', 15, 21, 'fishing-net drying rack on the quay'); H.need('crane_winch', 24, 21, 'cargo winch on the quay');
for (const [x, y] of [[45, 10], [45, 14], [20, 9], [3, 18], [30, 2]]) H.obj('bush', x, y);
H.obj('lamppost', 23, 17); H.obj('lamppost', 33, 17); H.obj('bench', 40, 16);
H.exits.push({ x: 17, y: 0, to: 'the_common_market' });
H.start = [17, 2];
H.stations = { combat: [36, 16], gather: [19, 26], artisan: [32, 15], idle: [27, 19] };

// ═══ 4. TOWN EDGE — quarry + mountain side, 48 x 32 ════════════════════════════════
const E = district('town_edge', 'Town Edge — Quarry & Mountain', 48, 32);
E.fill('^', 30, 0, 18, 32);                                  // the Mountain
E.fill('^', 26, 0, 4, 6);
E.fill('=', 18, 3, 11, 10); E.fill('^', 18, 3, 2, 2);        // the quarry bowl, cut into the foot
E.line('=', [[0, 16], [12, 16], [12, 14], [22, 14], [22, 12]], 2);
E.line('=', [[14, 17], [14, 22], [27, 22], [27, 19], [29, 19]], 1); // switchback up to the Cragface
for (const [x, y, n] of [[20, 6, 'copper'], [23, 5, 'copper'], [26, 7, 'iron'], [21, 9, 'iron'], [25, 10, 'coal'], [27, 11, 'coal']])
  E.need('ore_' + n, x, y, 'quarry node: ' + n + ' (gather station)');
E.obj('cart_wheel', 19, 11); E.obj('crate_stack', 28, 12); E.obj('chopping_block', 24, 12); E.obj('lantern_post', 22, 4);
E.line('=', [[36, 19], [44, 19], [44, 8], [34, 8], [34, 2], [46, 2]], 2);
E.line('=', [[33, 23], [33, 29], [44, 29]], 2);
for (const [x, y] of [[45, 14], [45, 9], [38, 9], [35, 4], [41, 3], [46, 3], [34, 26], [40, 30], [45, 30], [42, 20]]) E.obj('pine', x, y);
E.exits.push({ x: 47, y: 2, to: 'mountain_pass' });
E.labels.push(['Quarry', 18, 3, 11, 10, 'quarry']); E.labels.push(['MOUNTAIN', 30, 0, 18, 32, 'rock']);
// HIGH-END: Cragface House — built into a notch in the mountainside with a view west
E.fill('.', 29, 16, 9, 8);
E.bld('estate_cragface', 30, 17, 7, 4, 'stone_house', [33, 20], { label: 'Cragface House', tint: 'fancy', chimney: 35 });
E.fill('#', 30, 21, 7, 2); E.need('terrace_rail', 30, 22, 'cliff terrace balustrade with the view west over the town');
E.need('cliff_edge', 29, 23, 'rock-to-grass cliff lip so the notch reads as cut into the mountain');
E.plots.push({ slot: 'P_HE1', highEnd: true, building: 'estate_cragface', site: 'cut into the mountainside, view over the town', frontage: 'cliff terrace + switchback path' });
// P11 — EA mountain-side home
E.bld('home_p11', 15, 24, 6, 5, 'stone_house', [17, 24], { label: 'P11 (EA) mountain side', tint: 'ea', chimney: 19 });
E.line('=', [[17, 23], [17, 22]], 1);
E.plots.push({ slot: 'P11', ea: true, building: 'home_p11', tier: 'mountain side' });
for (const [x, y] of [[23, 26], [25, 26], [23, 28]]) E.obj('flower_bed', x, y);
for (const [x, y] of [[3, 20], [6, 25], [9, 21], [11, 29], [8, 8], [12, 4], [4, 4], [26, 28]]) E.obj(['oak', 'pine', 'young_oak'][(x + y) % 3], x, y);
E.obj('signpost', 3, 15); E.obj('bush', 8, 18);
E.exits.push({ x: 0, y: 16, to: 'the_common_market' });
E.start = [2, 17];
E.stations = { combat: [10, 12], gather: [23, 8], artisan: [20, 15], idle: [6, 17] };

// ═══ finish: trees, hash, lint, write ═════════════════════════════════════════════
const DISTRICTS = ART ? [M] : [M, S, H, E];
if (ART) for (const [oid, x, y] of M.made || []) {
  if (oid === 'market_stall') M.obj((x + y) % 2 ? 'market_stall' : 'market_stall_green', x, y);
  else if (oid === 'bank_sign' || oid === 'depot_sign') M.obj(oid, x + 1, y);   // hung on the wall beside the door
  else if (oid === 'estate_gate') { M.objects = M.objects.filter((o) => !(o.id === 'hedge' && o.y === 13 && Math.abs(o.x - x) <= 0)); }
  else M.obj(oid, x, y);
}
const solidCls = (id) => !tables.openClasses.includes(sprites[id].class);
function finish(d) {
  const rows = () => d.g.map((r) => r.join(''));
  const row = () => ({ id: d.id, name: d.name, kind: 'town', hunts: [], outdoor: true, light: 'day', ground: 'town_ground',
    legend: Object.fromEntries(Object.entries(LEGEND).filter(([c]) => d.g.some((r) => r.includes(c)))),
    rows: rows(), faces: [], objects: d.objects, buildings: d.buildings, path: [], spawns: [], stations: d.stations,
    exits: d.exits, start: d.start, maskHash: '' });
  const keep = new Set([d.start, ...Object.values(d.stations), ...d.exits.map((e) => [e.x, e.y])].map((p) => p.join()));
  for (const b of d.buildings) for (const [x, y] of b.doors) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) keep.add((x + i) + ',' + (y + j));
  const inB = (x, y) => d.buildings.some((b) => { const [bx, by, bw, bh] = b.rect; return x >= bx - 1 && x <= bx + bw && y >= by - 1 && y <= by + bh; });
  // drop objects that collide (solid on solid, on water/rock, in a building ring, on a door path)
  const taken = new Set(); const kept = [];
  for (const o of d.objects) {
    const [fw] = sprites[o.id].footprint; const tiles = Array.from({ length: fw }, (_, i) => (o.x + i) + ',' + o.y);
    const okGround = tiles.every((k) => { const [x, y] = k.split(',').map(Number); return x < d.w && !tables.materials[LEGEND[d.g[y][x]]].solid; });
    const clash = solidCls(o.id) && tiles.some((k) => taken.has(k) || keep.has(k));
    const inside = tiles.some((k) => { const [x, y] = k.split(',').map(Number); return d.buildings.some((b) => { const [bx, by, bw, bh] = b.rect; return x >= bx && x < bx + bw && y >= by && y < by + bh; }); });
    const north = solidCls(o.id) && !tables.treeClasses.includes(sprites[o.id].class) && d.buildings.some((b) => o.y === b.rect[1] + b.rect[3] - 2 && o.x > b.rect[0] && o.x < b.rect[0] + b.rect[2] - 1);
    if (!okGround || clash || (inside && sprites[o.id].class !== 'hanging') || north) { console.warn('  drop', d.id, o.id, o.x, o.y); continue; }
    if (solidCls(o.id)) tiles.forEach((k) => taken.add(k)); kept.push(o);
  }
  d.objects = kept;
  // a tree in every 12x12 window: plant on open grass away from buildings and lanes
  for (let pass = 0; pass < 400; pass++) {
    const r = row(); const lint = mapc.lintMap({ ...r, maskHash: mapc.compileMap(r, tables).maskHash }, tables).filter((p) => p.code === 'L-TREES');
    if (!lint.length) break;
    if (process.env.DBG) console.log(d.id, lint[0].msg);
    const [wx, wy] = /window at (\d+),(\d+)/.exec(lint[0].msg).slice(1).map(Number);
    let done = false;
    for (let j = wy + 10; j >= wy && !done; j--) for (let i = wx + 10; i >= wx && !done; i--) {
      if (i >= d.w || j >= d.h || d.g[j][i] !== '.' || taken.has(i + ',' + j) || keep.has(i + ',' + j) || inB(i, j)) continue;
      d.objects.push({ id: ['oak', 'pine', 'young_oak'][(i * 3 + j) % 3], x: i, y: j }); taken.add(i + ',' + j); done = true;
    }
    for (let j = wy + 11; j >= wy && !done; j--) for (let i = wx + 11; i >= wx && !done; i--) {
      if (i >= d.w || j >= d.h || !'.:='.includes(d.g[j][i]) || taken.has(i + ',' + j) || keep.has(i + ',' + j)) continue;
      if (d.buildings.some((b) => { const [bx, by, bw, bh] = b.rect; return i >= bx && i < bx + bw && j >= by - 1 && j <= by + bh; })) continue;
      d.objects.push({ id: ['oak', 'pine', 'young_oak'][(i * 3 + j) % 3], x: i, y: j }); taken.add(i + ',' + j); done = true;
    }
    if (!done) { console.warn('  no room for a tree near', wx, wy, 'in', d.id); break; }
  }
  const r = row(); r.maskHash = mapc.compileMap(r, tables).maskHash;
  return r;
}
const fmt = (r, d) => {
  const objs = r.objects.map((o) => `{ id: '${o.id}', x: ${o.x}, y: ${o.y} }`);
  const lines = []; for (let i = 0; i < objs.length; i += 4) lines.push('    ' + objs.slice(i, i + 4).join(', ') + ',');
  const J = (v) => JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ');
  return `// prototypes/town-v06/${r.id}.js — ${r.name}. Town v0.6 district (blueprint v0.5 + approved changes).
// GENERATED by prototypes/town-v06/build-maps.mjs — edit the generator, not this file.
// Row shape and lint: src/world/core/map-compile.js. '~' is the PROPOSED 'water' material (needs-art.json).
// plots: v0.6 proposal field (EA homes + high-end estates); the compiler ignores it.
export default Object.freeze({
  id: '${r.id}',
  name: ${J(r.name)},
  kind: 'town',
  hunts: Object.freeze([]),
  outdoor: true,
  light: 'day',
  ground: 'town_ground',
  legend: Object.freeze(${J(r.legend)}),
  rows: Object.freeze([
${r.rows.map((s) => "    '" + s + "',").join('\n')}
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
${lines.join('\n')}
  ]),
  buildings: Object.freeze([
${r.buildings.map((b) => '    ' + J(b) + ',').join('\n')}
  ]),
  path: Object.freeze([]),
  spawns: Object.freeze([]),
  stations: Object.freeze(${J(r.stations)}),
  exits: Object.freeze(${J(r.exits)}),
  start: Object.freeze(${J(r.start)}),
  plots: Object.freeze(${J(d.plots)}),
  maskHash: '${r.maskHash}',
});
`;
};
let red = 0; const out = {};
for (const d of DISTRICTS) {
  const r = finish(d);
  const problems = mapc.lintMap(r, tables);
  // exits must land on the map edge
  for (const e of r.exits) if (!(e.x === 0 || e.y === 0 || e.x === r.rows[0].length - 1 || e.y === r.rows.length - 1)) problems.push({ code: 'X-EDGE', msg: 'exit not on an edge' });
  console.log(r.id.padEnd(20), r.rows[0].length + 'x' + r.rows.length, problems.length ? 'RED ' + JSON.stringify(problems.slice(0, 6)) : 'lint green', r.maskHash);
  red += problems.length;
  writeFileSync(join(OUT, r.id + (ART ? '.art' : '') + '.js'), fmt(r, d));
  out[r.id] = { row: r, labels: d.labels, want: d.want, plots: d.plots };
}
const uniq = {};
for (const n of needsArt) (uniq[n.id] ||= { id: n.id, uses: [] }).uses.push({ map: n.map, x: n.x, y: n.y, why: n.why });
if (!ART) writeFileSync(join(HERE, 'needs-art.json'), JSON.stringify({
  materials: [{ id: 'water', char: '~', solid: true, why: 'river, weir pool and sea; needs a water terrain (wang with grass/planks edges) — rendered as void until then' },
    { id: 'hill/raised ground', why: 'Overmarket Rise and the Cragface notch have no elevation art' }],
  sprites: Object.values(uniq) }, null, 1));
if (!ART) writeFileSync(join(HERE, 'layout.json'), JSON.stringify(out));
process.exit(red ? 1 : 0);
