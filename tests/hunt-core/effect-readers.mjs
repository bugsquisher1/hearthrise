// tests/hunt-core/effect-readers.mjs — NO DEAD EFFECT FIELDS. Run by run-all.mjs.
//
// The class (2026-10-21): data rows promised effects nothing read. Nature's Wrath
// wrote `vulnUntil` that no damage read; Hunter's Mark's `bonusPct` (+20%) was shown
// to the player and never applied; bleed's `scalesWith` named a skill no caster
// passed. This guard fails when:
//   (1) a field on an ability row, ABILITY_RULES or a status row has no reader in
//       the engine (src/core, the hr-accrue edge), comments stripped; display-only
//       fields (DISPLAY) need a reader in the client instead;
//   (2) a unit field a core module PERSISTS (world-state composes them) is written
//       but never read anywhere outside world-state.js.
// A reader is `.field` not followed by a plain `=` (a compound `-=` reads).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { plant, makeReport, ROOT } from './fixtures/h1.js';

/* Fields a player reads, not the engine. */
const DISPLAY = Object.freeze({ ability: ['n'], status: ['name'] });
const ENGINE_DIRS = ['src/core', 'supabase/functions/hr-accrue'];
const CLIENT_DIRS = ['src/shell', 'src/hunt-view', 'src/session'];

const walk = (root, d) => {
  const out = [];
  let names = [];
  try { names = readdirSync(join(root, d)); } catch { return out; }
  for (const n of names) {
    const p = join(root, d, n);
    if (statSync(p).isDirectory()) out.push(...walk(root, join(d, n)));
    else if (/\.(js|mjs|ts)$/.test(n)) out.push(p);
  }
  return out;
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const textOf = (root, dirs, skip) => dirs.flatMap((d) => walk(root, d))
  .filter((p) => !(skip && skip.test(relative(root, p).replace(/\\/g, '/'))))
  .map((p) => strip(readFileSync(p, 'utf8'))).join('\n');
const reads = (text, key) => new RegExp('\\.' + key + '\\b(?!\\s*=[^=])').test(text);

async function load(root) {
  const v = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(root, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  const imp = (p) => import(pathToFileURL(join(root, p)).href + v);
  const M = { root, AD: await imp('src/data/abilities.js'), ST: await imp('src/data/statuses.js'), mods: [] };
  for (const n of ['movement', 'targeting', 'roles', 'pull-cycle', 'damage', 'abilities', 'status', 'consumables', 'xp-share', 'conditions']) {
    M.mods.push([n, await imp('src/core/hunt/' + n + '.js')]);
  }
  return M;
}

const cases = {
  'every-row-field-has-a-reader': (M) => {
    /* The engine copy under test (a planted root has src/core + src/data; the edge is read from the repo). */
    const engine = textOf(M.root, ['src/core'], null) + '\n' + textOf(ROOT, ['supabase/functions/hr-accrue'], null);
    const client = textOf(ROOT, CLIENT_DIRS, null);
    const dead = [];
    const check = (kind, keys, display) => {
      for (const k of keys) {
        if (k === 'id') continue;
        const ok = display.includes(k) ? reads(client, k) : reads(engine, k);
        if (!ok) dead.push(kind + '.' + k);
      }
    };
    check('ability', [...new Set(Object.values(M.AD.ABILITIES).flatMap((r) => Object.keys(r)))], DISPLAY.ability);
    check('ABILITY_RULES', Object.keys(M.AD.ABILITY_RULES), []);
    check('status', [...new Set(Object.values(M.ST.STATUSES).flatMap((r) => Object.keys(r)))], DISPLAY.status);
    return dead.length ? 'written, never read: ' + dead.join(', ') : null;
  },
  'every-persisted-unit-field-is-read': (M) => {
    /* The PERSISTED declarations themselves are not readers; a field named by a string key
       (consumables.js OT_KEY: u[OT_KEY[stat]]) is. */
    const all = (textOf(M.root, ['src/core'], /src\/core\/hunt\/world-state\.js$/) + '\n'
      + textOf(ROOT, ['supabase/functions/hr-accrue', 'src/hunt-view', 'src/shell'], null))
      .replace(/export const PERSISTED = Object\.freeze\(\{[\s\S]*?\n\}\);/g, '');
    const keyed = (f) => new RegExp('[\'"]' + f + '[\'"]').test(all);
    const dead = [];
    for (const [n, mod] of M.mods) for (const [field] of (mod.PERSISTED && mod.PERSISTED.unit) || []) if (!reads(all, field) && !keyed(field)) dead.push(n + ':' + field);
    return dead.length ? 'persisted, never read: ' + dead.join(', ') : null;
  },
};

const mutants = [
  { name: 'a row promises a field nothing reads', case: 'every-row-field-has-a-reader',
    edits: [['src/data/abilities.js', "target: 'mark',\n    bonusPct: 20, durMs: 8000 }),", "target: 'mark',\n    bonusPct: 20, durMs: 8000, slowPct: 30 }),"]] },
  { name: 'the mark bonus is never applied', case: 'every-row-field-has-a-reader',
    edits: [['src/core/hunt/abilities.js', 't.markPm = row.bonusPct * 10;', 't.markPm = 200;']] },
  { name: 'bleed stops scaling with its skill', case: 'every-row-field-has-a-reader',
    edits: [['src/core/hunt/abilities.js', 'levelOf(h.skills, srow.scalesWith)', "levelOf(h.skills, 'melee')"]] },
  { name: 'a persisted unit field nothing reads', case: 'every-persisted-unit-field-is-read',
    edits: [['src/core/hunt/abilities.js', "['markUntil', 'int']]),", "['markUntil', 'int'], ['slowUntil', 'int']]),"]] },
];

const R = makeReport('hunt-core/effect-readers');
const M = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of mutants) {
  const p = plant(mu.edits);
  try {
    let why = null;
    try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    if (process.env.H2_WHY) console.log('  mutant "' + mu.name + '" -> ' + why);
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
