/**
 * Stage wave-2 sources into id-named copies so the contact sheet's labels are
 * the ITEM IDS rather than the 50-character prompt-echo filenames. Duplicates
 * become `<id>__b`, `<id>__c` in filename order, so a dupe pick can be stated
 * as "id__b" and traced back through `_index.json`.
 *
 * Output: assets/art-pilot/wave2-raw/ (unshipped; .gitignored like the rest).
 */
import fs from 'fs';
import path from 'path';
import url from 'url';
import { SRC, listSources, idFor } from './art-wave2-map.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'assets', 'art-pilot', 'wave2-raw');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const byId = {};
listSources().forEach((f) => { const id = idFor(f); (byId[id] = byId[id] || []).push(f); });

const index = {};
Object.keys(byId).sort().forEach((id) => {
  byId[id].forEach((f, i) => {
    const name = id + (i ? '__' + 'abcdefg'[i] : '') + '.png';
    fs.copyFileSync(path.join(SRC, f), path.join(OUT, name));
    index[name.slice(0, -4)] = f;
  });
});
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(index, null, 2));
console.log('staged', Object.keys(index).length, 'into', OUT);
