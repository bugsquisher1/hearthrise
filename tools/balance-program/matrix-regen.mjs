#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/matrix-regen.mjs — RE-WRITE A SCRATCH COPY'S MONSTER ROWS FROM ITS FORMULA (matrix-scratch.mjs, lane/c-balance-matrix).
//
//   node tools/balance-program/matrix-regen.mjs <copy root>
//
// The copy's own tools/gen-ground-stats.mjs proposes every rostered monster's formula numbers (proposeGround, its named exceptions kept) and
// writes each row in the file that holds it: src/data/monsters.js, or a ground pack (src/data/grounds/<id>/pack.js). The game's own
// `--write` reaches monsters.js only, and stops at the first pack row (the formula audit's to own); this is the same writer (writeRows)
// pointed at each row's file. Runs in its own process so the caller never holds the copy's rows as they were before. Refuses the repo.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = resolve(process.argv[2] || '');
const rel = relative(REPO, root);
if (!process.argv[2] || !rel.startsWith('..') && !isAbsolute(rel)) { console.error('matrix-regen: give a scratch copy outside the repo (got ' + root + ')'); process.exit(2); }
const u = (p) => pathToFileURL(join(root, p)).href;
const GS = await import(u('tools/gen-ground-stats.mjs'));
const { MONSTERS } = await import(u('src/data/monsters.js'));
const { formulaStats, tierRowFor } = await import(u('src/data/balance-sheet.js'));
const { HUNT_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
const floorOf = (gid) => HUNT_INDEX[HUNT_GROUNDS[gid].hunt].band[0];
const D = { MONSTERS, formulaStats, tierRowFor, floorOf, fitOf: (gid) => GS.groundFit(HUNT_GROUNDS[gid]) };
const rows = Object.keys(GS.ROSTER).flatMap((g) => GS.proposeGround(g, D));
const packs = existsSync(join(root, 'src/data/grounds')) ? readdirSync(join(root, 'src/data/grounds')).map((d) => join(root, 'src/data/grounds', d, 'pack.js')).filter(existsSync) : [];
const files = [join(root, 'src/data/monsters.js'), ...packs];
const text = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));
const byFile = new Map();
for (const r of rows) {
  const f = files.find((x) => new RegExp('^ +' + r.id + ': \\{', 'm').test(text[x]));
  if (!f) { console.error('matrix-regen: no file holds the row ' + r.id); process.exit(1); }
  (byFile.get(f) || byFile.set(f, []).get(f)).push(r);
}
let moved = 0;
for (const [f, rs] of byFile) moved += GS.writeRows(rs, f);
console.log('matrix-regen: ' + rows.length + ' rows proposed, ' + moved + ' moved in ' + byFile.size + ' file(s)');
