#!/usr/bin/env node
// tools/balance-program/redesign/roads/check-lend.mjs — proves the roads-lend candidate plants: every borrowed row exists on the scratch
// copy with its scaled numbers, on the borrower's discipline, and the engine seams are in; roads-lend-rules.json plants its two rules too.
// Exit 0 planted · 1 not.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const C = await import(pathToFileURL(join(ROOT, 'tools/balance-program/candidates.mjs')).href);
const { LEND, lentId } = await import(pathToFileURL(join(HERE, 'make-lend.mjs')).href);
const T = await C.treeOf(C.readCandidate(join(HERE, 'roads-lend.json')));
let bad = 0;
try {
  const A = await import(pathToFileURL(join(T.root, 'src/data/abilities.js')).href);
  for (const [id, d, pm, reach] of LEND) {
    const n = A.ABILITIES[id], r = A.ABILITIES[lentId(id, d, pm, reach)];
    const ok = r && r.lent && r.disciplines[0] === d && A.disciplineAbilities(d).includes(r.id) && (reach ? r.reach === reach : r.reach === undefined);
    const nums = ['hitPm', 'healPm', 'shieldPm', 'bonusPct', 'holdPm', 'base'].filter((k) => r && r[k] !== undefined).map((k) => k + ' ' + JSON.stringify(n[k]) + '->' + JSON.stringify(r[k])).join(', ');
    console.log((ok ? 'ok  ' : 'BAD ') + lentId(id, d, pm, reach) + '  ' + nums);
    if (!ok) bad++;
  }
  const core = readFileSync(join(T.root, 'src/core/hunt/abilities.js'), 'utf8'), tg = readFileSync(join(T.root, 'src/core/hunt/targeting.js'), 'utf8');
  const ct = readFileSync(join(T.root, 'src/core/hunt/cast-targets.js'), 'utf8');
  for (const [f, s] of [[ct, '(row.reach || Math.max(1,'], [core, 'challengeable(inst, hero, row.lent)'], [tg, 'row && row.holdPm'], [tg, '(!isTank(k) && !lent)']]) { const ok = f.includes(s); console.log((ok ? 'ok  ' : 'BAD ') + 'seam ' + s); if (!ok) bad++; }
  { const cd = readFileSync(join(T.root, 'src/core/hunt/conditions.js'), 'utf8'), ok = cd.includes('ABILITIES[cx.slot.action.id].reach'); console.log((ok ? 'ok  ' : 'BAD ') + 'seam conditions reach'); if (!ok) bad++; }
} finally { T.done(); }
/* roads-lend-rules.json (lane/roads-borrow-values): the same plant, the lent shot's seam and Greater Mend's native reach */
const S = await C.treeOf(C.readCandidate(join(HERE, 'roads-lend-rules.json')));
try {
  const ok = readFileSync(join(S.root, 'src/core/hunt/abilities.js'), 'utf8').includes("h.hs.bag.bronze_arrows ? 'bronze_arrows' : null");
  console.log((ok ? 'ok  ' : 'BAD ') + 'seam the lent shot (roads-lend-rules.json)');
  const A = await import(pathToFileURL(join(S.root, 'src/data/abilities.js')).href);
  const reach = A.ABILITIES.greater_mend.reach === 7;
  console.log((reach ? 'ok  ' : 'BAD ') + 'greater_mend reach 7 (roads-lend-rules.json)');
  if (!ok) bad++;
  if (!reach) bad++;
} finally { S.done(); }
process.exit(bad ? 1 : 0);
