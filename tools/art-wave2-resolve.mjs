/** Which wave-2 ids resolve against live ITEMS, and where they currently stand in item-art.js. */
import path from 'path';
import url from 'url';
import { listSources, idFor } from './art-wave2-map.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const { ITEMS } = await import(url.pathToFileURL(path.join(ROOT, 'src/data/items.js')).href);
const art = await import(url.pathToFileURL(path.join(ROOT, 'src/data/item-art.js')).href);

const ids = [...new Set(listSources().map(idFor))].sort();
const rejCat = {}; art.REJECTED_WRONG_SUBJECT.forEach((k) => { const [c, i] = k.split('/'); rejCat[i] = c; });
const unres = new Set(art.UNRESOLVED_FILES.map((k) => k.split('/')[1]));
const shipped = new Set(Object.values(art.SHIPPED).flat());

const live = [], dead = [];
for (const id of ids) {
  const row = { id, rej: rejCat[id] || '', unres: unres.has(id), shipped: shipped.has(id) };
  (ITEMS[id] ? live : dead).push(row);
}
console.log('LIVE ITEMS ids:', live.length);
live.forEach((r) => console.log(' ', r.id.padEnd(24), 'cat=' + (r.rej || '?'), r.unres ? 'UNRESOLVED-listed' : '', r.shipped ? 'ALREADY-SHIPPED' : ''));
console.log('\nNOT AN ITEMS KEY:', dead.length);
dead.forEach((r) => console.log(' ', r.id.padEnd(24), r.unres ? '(in UNRESOLVED_FILES)' : '(NOT even listed)'));
