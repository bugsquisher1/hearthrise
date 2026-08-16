/** Print the SUBJECT clause only (strip the shared wrapper) for the wave-2 ids. */
import fs from 'fs';
import path from 'path';
import url from 'url';
import { listSources, idFor } from './art-wave2-map.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const txt = fs.readFileSync(path.join(ROOT, 'docs/design/item-session-pack.txt'), 'utf8');
const PRE = 'proportions readable and heroic, ';
const POST = ', painted in confident thick brush strokes';
const want = new Set(listSources().map(idFor));
const seen = new Set();
for (const line of txt.split(/\r?\n/)) {
  const id = (line.split(',')[0] || '').trim();
  if (!want.has(id) || seen.has(id)) continue;
  const a = line.indexOf(PRE), b = line.indexOf(POST);
  if (a < 0 || b < 0) continue;
  seen.add(id);
  console.log(id.padEnd(22) + ' | ' + line.slice(a + PRE.length, b));
}
console.log('\nNO SUBJECT LINE FOUND:', [...want].filter((i) => !seen.has(i)).join(', ') || 'none');
