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
  /* (the reach and the lent taunt are the engine's own since lane/e5-borrowing: the fields it reads, in the tree as shipped) */
  const core = readFileSync(join(T.root, 'src/core/hunt/abilities.js'), 'utf8'), tg = readFileSync(join(T.root, 'src/core/hunt/targeting.js'), 'utf8');
  const ct = readFileSync(join(T.root, 'src/core/hunt/cast-targets.js'), 'utf8'), cd = readFileSync(join(T.root, 'src/core/hunt/conditions.js'), 'utf8');
  for (const [f, s] of [[ct, 'Number.isInteger(row.reach)'], [core, 'challengeable(inst, hero, row)'], [tg, 'Number.isInteger(row.holdPm)'], [tg, "!(row && row.lent === true)"], [cd, 'slotReach(cx)']]) { const ok = f.includes(s); console.log((ok ? 'ok  ' : 'BAD ') + 'engine reads ' + s); if (!ok) bad++; }
} finally { T.done(); }
/* roads-lend-rules.json (lane/roads-borrow-values): the same plant, the lent shot's seam and Greater Mend's native reach */
const S = await C.treeOf(C.readCandidate(join(HERE, 'roads-lend-rules.json')));
try {
  const ok = readFileSync(join(S.root, 'src/core/hunt/abilities.js'), 'utf8').includes("h.hs.bag.bronze_arrows ? 'bronze_arrows' : null");
  console.log((ok ? 'ok  ' : 'BAD ') + 'seam the lent shot (roads-lend-rules.json)');
  if (!ok) bad++;
  /* (the native reach and the taunt from any seat an engine borrow plays are the engine's own since lane/e5-borrowing: talent-rows.js lend) */
  const tr = readFileSync(join(S.root, 'src/core/hunt/talent-rows.js'), 'utf8');
  for (const s of ['o.reach = reach', 'o.lent = true']) { const k = tr.includes(s); console.log((k ? 'ok  ' : 'BAD ') + 'engine lends ' + s); if (!k) bad++; }
} finally { S.done(); }
process.exit(bad ? 1 : 0);
