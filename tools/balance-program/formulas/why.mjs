#!/usr/bin/env node
// tools/balance-program/formulas/why.mjs — READ-ONLY: the first commit that introduced each string under src/core and src/data
// (git log -S, oldest first). The formula audit's "why does this exception exist" column (balance program 40-formula-brief.md §2).
//   node tools/balance-program/formulas/why.mjs <string> [<string> ...]
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
for (const s of process.argv.slice(2)) {
  let out;
  try {
    out = execFileSync('git', ['log', '-S' + s, '--reverse', '--format=%ad %h %s', '--date=short', '--', 'src/core', 'src/data'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')[0];
  } catch (e) { out = 'ERR ' + String(e.message).slice(0, 80); }
  console.log(s + ' | ' + (out || '(not found)').slice(0, 160));
}
