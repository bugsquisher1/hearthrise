/** Emit the updated SHIPPED / REJECTED_WRONG_SUBJECT blocks for src/data/item-art.js. */
import path from 'path';
import url from 'url';
import { WIRE } from './art-wave2-select.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const art = await import(url.pathToFileURL(path.join(ROOT, 'src/data/item-art.js')).href);

const wrap = (items, indent) => {
  const out = []; let line = '';
  items.forEach((s) => {
    const t = `'${s}', `;
    if ((indent + line + t).length > 98) { out.push(indent + line.trimEnd()); line = ''; }
    line += t;
  });
  if (line) out.push(indent + line.trimEnd());
  return out.join('\n');
};

const added = {};
Object.entries(WIRE).forEach(([id, [cat]]) => { (added[cat] = added[cat] || []).push(id); });

console.log('/* ── SHIPPED ── */');
art.CATEGORIES.forEach((c) => {
  const list = [...new Set([...art.SHIPPED[c], ...(added[c] || [])])].sort();
  console.log(`  ${c}: Object.freeze([`);
  console.log(wrap(list, '    '));
  console.log(`  ]),`);
});
const total = art.CATEGORIES.reduce((a, c) => a + new Set([...art.SHIPPED[c], ...(added[c] || [])]).size, 0);
console.log(`/* TOTAL ${total} */`);

const wiredKeys = new Set(Object.entries(WIRE).map(([id, [cat]]) => cat + '/' + id));
const rej = art.REJECTED_WRONG_SUBJECT.filter((k) => !wiredKeys.has(k)).sort();
console.log(`\n/* ── REJECTED_WRONG_SUBJECT (${rej.length}) ── */`);
console.log(wrap(rej, '  '));

/* --apply rewrites the two literals in place. Done by script rather than by hand
   because a 473-entry list edited by eye is exactly the mis-map this file exists
   to prevent; `itemArtPreflight()` then reconciles the result against real files. */
if (process.argv.includes('--apply')) {
  const fs = await import('node:fs');
  const F = path.join(ROOT, 'src/data/item-art.js');
  let src = fs.readFileSync(F, 'utf8');
  art.CATEGORIES.forEach((c) => {
    const list = [...new Set([...art.SHIPPED[c], ...(added[c] || [])])].sort();
    const re = new RegExp('(  ' + c + ': Object\\.freeze\\(\\[\\n)[\\s\\S]*?(\\n  \\]\\),)');
    if (!re.test(src)) throw new Error('SHIPPED.' + c + ' block not found');
    src = src.replace(re, (m, a, b) => a + wrap(list, '    ') + b);
  });
  const rre = /(export const REJECTED_WRONG_SUBJECT = Object\.freeze\(\[\n)[\s\S]*?(\n\]\);)/;
  if (!rre.test(src)) throw new Error('REJECTED_WRONG_SUBJECT block not found');
  src = src.replace(rre, (m, a, b) => a + wrap(rej, '  ') + b);
  src = src.replace(/\bthis list and the\n \* filesystem disagree in either direction, and fails again if any id here is\n \* not a live `ITEMS` key\. \d+ entries\./,
    'this list and the\n * filesystem disagree in either direction, and fails again if any id here is\n * not a live `ITEMS` key. ' + total + ' entries.');
  fs.writeFileSync(F, src);
  console.log('\npatched src/data/item-art.js  SHIPPED=' + total + '  REJECTED=' + rej.length);
}
