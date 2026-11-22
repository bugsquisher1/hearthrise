// tools/balance-program/levers/dsl.mjs — the short forms the lever rows are written in (tools/balance-program/levers.mjs reads them).
// A row: L(id, category, class, name, { at: [site], def, range, touches, out, f, tests, perturb, rows, flags, ev, change, names }).
//   at(file, anchor, { count })  a site: the line(s) of `file` holding the exact text `anchor` (`count` lines, 1 by default)
//   K / P / V / NP               the eighth field: a knobs.json knob, a patch edit on the site's line, a matrix cell variant, NOT PLAYABLE
//   flag(kind, why, ev)          redundant | ineffective | contradictory, with its evidence
//   rows(what, homes, measure)   a content attribute: the tables that hold its rows (pinned `keys` unless a home says `open`), and how to
//                                count them today (an import of the game's own module, run by --write only)

export const L = (id, cat, cls, name, o) => Object.freeze({ id, cat, cls, name, ...o });
export const at = (file, anchor, o = {}) => ({ file, anchor, ...o });
export const K = (knob, note) => ({ kind: 'knob', knob, ...(note ? { note } : {}) });
export const P = (note, planned) => ({ kind: 'patch', ...(note ? { note } : {}), ...(planned ? { planned } : {}) });
export const V = (variant, note) => ({ kind: 'variant', variant, ...(note ? { note } : {}) });
export const NP = (gap, note, planned) => ({ kind: 'not-playable', gap, ...(note ? { note } : {}), ...(planned ? { planned } : {}) });
export const flag = (kind, why, ev) => ({ kind, why, ev });
export const home = (at, pin = 'keys') => ({ at, pin });
export const rows = (what, homes, measure, names) => ({ what, homes: homes.map((h) => (typeof h === 'string' ? home(h) : h)), ...(measure ? { measure } : {}), ...(names ? { names } : {}) });

/* MEASURES (run by --write: `load(file)` imports a module of the tree) */
const valuesAt = (row, path) => {
  let cur = [row];
  for (const k of path.split('.')) cur = cur.flatMap((x) => (x == null ? [] : k === '*' ? (Array.isArray(x) ? x : Object.values(x)) : [x[k]]));
  return cur;
};
const tableRows = (t) => (Array.isArray(t) ? t : Object.values(t || {})).filter((r) => r && typeof r === 'object');
/** stats of `path` over every row of `file`'s export `name`: rows that carry a number there, the distinct values, the low and the high */
export const field = (file, name, path, where = null) => async (load) => {
  const m = await load(file);
  const all = tableRows(m[name]).filter((r) => !where || where(r));
  const nums = all.flatMap((r) => valuesAt(r, path)).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const sorted = nums.slice().sort((a, b) => a - b);
  return { table: file + ' ' + name, rows: all.length, carrying: nums.length, distinct: new Set(nums).size, low: sorted[0] ?? null, high: sorted[sorted.length - 1] ?? null };
};
/** several `field` measures in one */
export const fields = (...ms) => async (load) => { const out = []; for (const m of ms) out.push(await m(load)); return out; };
