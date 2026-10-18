// tests/hunt-core/purity.mjs — every src/core/hunt/*.js is dual-runtime and deterministic (spec §1.1):
// no Math.random, no clock, no DOM / window / G, no timers, no storage, no network. Run by run-all.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { suite } from './fixtures/h1.js';

const FORBIDDEN = [
  [/\bMath\.random\b/, 'Math.random'], [/\bDate\.now\b/, 'Date.now'], [/\bnew Date\b/, 'new Date'],
  [/\bperformance\./, 'performance'], [/\bdocument\b/, 'document'], [/\bwindow\b/, 'window'], [/\bglobalThis\b/, 'globalThis'],
  [/(^|[^\w$.])G\./, 'G.'], [/\bset(Timeout|Interval)\b/, 'timers'], [/\b(local|session)Storage\b/, 'storage'],
  [/\bfetch\s*\(/, 'fetch'], [/\brequire\s*\(/, 'require'], [/\bprocess\./, 'process'],
];
/* Comments may name what code must not call. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

const cases = {
  'core-is-pure': (M) => {
    const dir = join(M.root, 'src/core/hunt');
    const bad = [];
    const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
    if (files.length < 15) return 'expected the 15 hunt core modules, found ' + files.length;
    for (const f of files) {
      const src = code(readFileSync(join(dir, f), 'utf8'));
      for (const [re, what] of FORBIDDEN) if (re.test(src)) bad.push(f + ' uses ' + what);
      for (const m of src.matchAll(/from\s+'(\.[^']*)'/g)) if (!/\?v=\d[\d.]*$/.test(m[1])) bad.push(f + ' imports ' + m[1] + ' with no ?v=');
    }
    return bad.length ? bad.join('; ') : null;
  },
};

const mutants = [
  { name: 'movement rolls Math.random', case: 'core-is-pure',
    edits: [['src/core/hunt/movement.js', '  let budget = Math.floor((u.speed * sc.dtMs) / 1000);', '  let budget = Math.floor((u.speed * sc.dtMs) / 1000) + (Math.random() < 0 ? 1 : 0);']] },
  { name: 'a status tick reads the clock', case: 'core-is-pure',
    edits: [['src/core/hunt/status.js', '  const units = inst.world.units;', '  const units = inst.world.units; Date.now();']] },
];

await suite('hunt-core/purity', cases, mutants);
