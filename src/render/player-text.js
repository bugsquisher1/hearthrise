// ════════════════════════════════════════════════════════════════════════
// src/render/player-text.js — EVERY WORD A PLAYER READS, BY ITS ID (lane/b-text-home).
//
// PURE. `t('farm.tier_now', { tier: 2, crops })` reads one row of the text table
// (src/data/text/*) and fills its named placeholders. A row is a WHOLE sentence,
// never a piece to glue: a sentence built from fragments can't be reviewed,
// linted or translated. A row that changes with a number is an object of plural
// forms ({ one, other }), picked by `vars.count` (a number) through the
// language's own plural rules, so a translation can add the forms its language has.
// A placeholder's value is written as given (format it first: whole(), gold()).
// A missing id or a missing value is a slip: a node run (the tests, the tools)
// throws, the page logs it once and shows a blank, never a code token.
// tests/text-home.mjs checks every call site against the table.
// ════════════════════════════════════════════════════════════════════════
import { TEXT } from '../data/text/text-table.js?v=0.2.130';

const PLURAL = new Intl.PluralRules('en-US');
const STRICT = typeof document === 'undefined';
const told = new Set();
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

function slip(what) {
  if (STRICT) throw new Error('player-text: ' + what);
  if (!told.has(what)) { told.add(what); console.error('player-text: ' + what); }
}

/** The row for 'surface.key' (a string or an object of plural forms), else undefined. */
function rowOf(id) {
  const s = String(id), dot = s.indexOf('.');
  const surface = dot > 0 && own(TEXT, s.slice(0, dot)) ? TEXT[s.slice(0, dot)] : null;
  return surface && own(surface, s.slice(dot + 1)) ? surface[s.slice(dot + 1)] : undefined;
}

/** Whether the table holds `id` (a lookup keyed by a server code asks first). */
export function hasText(id) { return rowOf(id) !== undefined; }

/** The sentence `id` with its {placeholders} filled from `vars`. */
export function t(id, vars) {
  const row = rowOf(id);
  if (row === undefined) { slip('no row ' + id); return ''; }
  let s = row;
  if (typeof row === 'object') {
    const n = vars ? vars.count : undefined;
    if (typeof n !== 'number' || !Number.isFinite(n)) slip(id + ' picks its form by a number {count}');
    const form = typeof n === 'number' ? PLURAL.select(n) : 'other';
    s = own(row, form) ? row[form] : row.other;
  }
  if (s.indexOf('{') < 0) return s;
  return s.replace(/\{([a-z][A-Za-z0-9_]*)\}/g, (_, k) => {
    const v = own(vars, k) ? vars[k] : undefined;
    if (v === undefined || v === null) { slip(id + ' has no value for {' + k + '}'); return ''; }
    return String(v);
  });
}
