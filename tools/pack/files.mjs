// ════════════════════════════════════════════════════════════════════════
// tools/pack/files.mjs — A GROUND PACK'S FILES (lane/b-ground-pack): the index writer, a pack's source text, and the fixture pack
// the guards plant (a copy of a shipped ground under new ids: the same content through the pack path).
//
// src/data/grounds/index.js is WRITTEN, never hand-merged: one import and one row a pack, in id order, from the folders that
// hold a pack.js. writeIndex(root) is idempotent; indexText(ids) is the whole file.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GROUNDS_DIR = (root = ROOT) => join(root, 'src', 'data', 'grounds');
const ID = /^[a-z0-9_]{1,40}$/;

/** The build's cache-buster (src/build-info.js BUILD.version), read as text so no module is evaluated. */
export function buildVersion(root = ROOT) {
  const m = readFileSync(join(root, 'src', 'build-info.js'), 'utf8').match(/version:\s*'(\d+\.\d+\.\d+)'/);
  if (!m) throw new Error('pack: no BUILD.version in src/build-info.js');
  return m[1];
}

/** Every pack folder under src/data/grounds (a folder with a pack.js), sorted. */
export function packIds(root = ROOT) {
  const dir = GROUNDS_DIR(root);
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && ID.test(d.name) && existsSync(join(dir, d.name, 'pack.js'))).map((d) => d.name).sort();
}

const camel = (id) => 'pack_' + id;
/** src/data/grounds/index.js for these pack ids. */
export function indexText(ids, version) {
  const head = readFileSync(join(GROUNDS_DIR(), 'index.js'), 'utf8').split('/* pack imports (tools/pack.mjs index) */')[0];
  return head + '/* pack imports (tools/pack.mjs index) */\n'
    + ids.map((id) => `import ${camel(id)} from './${id}/pack.js?v=${version}';\n`).join('')
    + '\nexport const GROUND_PACKS = Object.freeze([\n  /* pack rows (tools/pack.mjs index) */\n'
    + ids.map((id) => `  ${camel(id)},\n`).join('')
    + ']);\n';
}

/** Write the index from the folders. Answers whether it changed. `only` (ids) writes those packs alone (the whole-view hook). */
export function writeIndex(root = ROOT, only = null) {
  const ids = only || packIds(root);
  const file = join(GROUNDS_DIR(root), 'index.js');
  const next = indexText(ids, buildVersion(root));
  const was = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (was === next) return false;
  writeFileSync(file, next);
  return true;
}

/** A pack's source: pack.js (the rows) and map.js (the map row), as data literals. */
export function packSources(pack, version) {
  const { map, ...rest } = pack;
  const lit = (o) => JSON.stringify(o, null, 1).replace(/\n\s*/g, ' ');
  const head = (what) => `// src/data/grounds/${pack.id}/${what} — written by tools/pack.mjs (lane/b-ground-pack). Shape: src/data/grounds/shape.js.\n`;
  /* a monster row in the house style (monsters.js): one row a block, its stat line on its own, so tools/pack.mjs propose --write
     (gen-ground-stats writeRows) finds and moves it like any other */
  const STAT = ['hp', 'atk', 'baseAcc', 'def', 'xp', 'gp', 'formula'];
  const monster = (id, m) => {
    if (!['hp', 'atk', 'def', 'xp'].every((k) => Number.isInteger(m[k])) || !Array.isArray(m.gp)) return `    ${id}: ${lit(m)},\n`;
    const other = Object.fromEntries(Object.entries(m).filter(([k]) => !STAT.includes(k)));
    const stat = 'hp: ' + (m.hp | 0) + ', atk: ' + (m.atk | 0) + (Number.isFinite(m.baseAcc) ? ', baseAcc: ' + m.baseAcc : '') + ', def: ' + (m.def | 0)
      + ', xp: ' + (m.xp | 0) + ', gp: [' + (m.gp || [1, 1]).join(', ') + ']' + (m.formula ? ', formula: true' : '');
    return `    ${id}: {\n      ${lit(other).slice(1, -1).trim()},\n      ${stat} },\n`;
  };
  const field = ([k, v]) => (k === 'monsters' ? '  monsters: {\n' + Object.entries(v).map(([id, m]) => monster(id, m)).join('') + '  },\n' : `  ${k}: ${lit(v)},\n`);
  return {
    'map.js': head('map.js') + `export default Object.freeze(${lit(map)});\n`,
    'pack.js': head('pack.js') + `import { definePack } from '../shape.js?v=${version}';\nimport map from './map.js?v=${version}';\n\n`
      + 'export default definePack({\n' + Object.entries(rest).map(field).join('') + '  map,\n});\n',
  };
}

/** Write a pack's folder and the index. Answers the folder. */
export function writePack(root, pack) {
  const dir = join(GROUNDS_DIR(root), pack.id);
  mkdirSync(dir, { recursive: true });
  for (const [f, text] of Object.entries(packSources(pack, buildVersion(root)))) writeFileSync(join(dir, f), text);
  writeIndex(root);
  return dir;
}

/** Remove a pack's folder and re-write the index (the guards' planted fixture comes out this way). */
export function removePack(root, id) {
  if (!ID.test(id)) throw new Error('pack: bad id ' + id);
  rmSync(join(GROUNDS_DIR(root), id), { recursive: true, force: true });
  writeIndex(root);
}

/**
 * THE FIXTURE: shipped ground `gid` as a pack under new ids (`prefix` on the ground, its map and every monster it places), its
 * rows otherwise the shipped ones. opts { prefix = 'fx_', status = 'open', sql = null, band = null }. Reads the data of `root`.
 */
export async function fixturePack(gid, opts = {}, root = ROOT) {
  const pre = opts.prefix || 'fx_';
  if ((opts.status || 'open') === 'open' && !opts.sql) opts = { ...opts, sql: '2099-01-01-pack-' + pre + gid + '.generated.sql' };
  const v = (p) => pathToFileURL(join(root, p)).href;
  const { HUNT_INDEX } = await import(v('src/data/hunts.js'));
  const G = await import(v('src/data/hunt-grounds.js'));
  const { MONSTERS } = await import(v('src/data/monsters.js'));
  const { mapRowOf } = await import(v('src/data/world/maps/index.js'));
  const { GROUND_ROSTER } = await import(v('src/data/balance-sheet.js'));
  const g = G.HUNT_GROUNDS[gid];
  if (!g) throw new Error('pack fixture: no ground ' + gid);
  const id = pre + gid, mon = (m) => pre + m;
  const plain = (o) => JSON.parse(JSON.stringify(o));
  const { id: _i, staged: _s, ...hunt } = plain(HUNT_INDEX[g.hunt]);
  hunt.spawns = hunt.spawns.map((s) => ({ ...s, monster: mon(s.monster) }));
  hunt.art = mon(hunt.art);
  hunt.name = 'Fixture ' + hunt.name;
  const shift = opts.band ? opts.band[0] - hunt.band[0] : 0; /* a new band moves every Level with it */
  if (opts.band) hunt.band = opts.band;
  const { id: _g, hunt: _h, ...ground } = plain(g);
  ground.map = pre + g.map;
  const re = (s) => ({ ...s, monster: mon(s.monster) });
  ground.pockets = ground.pockets.map((p) => ({ ...p, spawns: (p.spawns || []).map(re), ...(p.pack ? { pack: p.pack.map(re) } : {}) }));
  const map = { ...plain(mapRowOf(g.map)), id: pre + g.map, name: 'Fixture ' + mapRowOf(g.map).name };
  if (Array.isArray(map.hunts)) map.hunts = map.hunts.map((h) => (h === g.hunt ? id : h));
  const placed = new Set(ground.pockets.flatMap((p) => [...p.spawns, ...(p.pack || [])].map((s) => s.monster)));
  const monsters = {}, roster = {};
  for (const m of [...placed].sort()) {
    const src = m.slice(pre.length);
    monsters[m] = { ...plain(MONSTERS[src]), name: 'Fixture ' + MONSTERS[src].name, ...(shift && Number.isInteger(MONSTERS[src].level) ? { level: MONSTERS[src].level + shift } : {}) };
    roster[m] = GROUND_ROSTER[gid][src];
  }
  /* the ground's own rows on the shared tables come with it: its tier row, its XP fit, its party rows */
  const BS = await import(v('src/data/balance-sheet.js'));
  const PC = await import(v('src/data/party-class-xp.js'));
  const SU = await import(v('src/data/supplies.js'));
  const has = (o) => Object.prototype.hasOwnProperty.call(o, gid);
  const rowOf = (t) => (has(t) ? Object.fromEntries(Object.entries(plain(t[gid]))) : undefined);
  const extra = {
    ...(has(BS.TIER_PULL_OVERRIDES) ? { tierOverride: plain(BS.TIER_PULL_OVERRIDES[gid]) } : {}),
    ...(has(BS.GROUND_XP_FIT) ? { xpFit: { k: BS.GROUND_XP_FIT[gid], why: 'as ' + gid } } : {}),
    ...(has(PC.PARTY_CLASS_XP) ? { partyClassXp: rowOf(PC.PARTY_CLASS_XP) } : {}),
    ...(has(PC.PARTY_VS_ALONE) ? { partyVsAlone: rowOf(PC.PARTY_VS_ALONE) } : {}),
    ...(has(SU.BAG_GUIDE_BY_HUNT) ? { bagGuide: plain(SU.BAG_GUIDE_BY_HUNT[gid]) } : {}),
  };
  return { id, status: opts.status || 'open', sql: opts.sql || null, hunt, ground, map, monsters, roster, ...extra };
}
