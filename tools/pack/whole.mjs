// ════════════════════════════════════════════════════════════════════════
// tools/pack/whole.mjs — THE WHOLE VIEW: a whole-catalogue generator renders the base and the FOLDED ground packs only
// (lane/b-ground-pack phase 4; the board's "2026-11-05 Ground Packs", "How catalogue migrations shrink").
//
// A shipped pack's server rows live in its own additive file (<date>-pack-<id>.generated.sql, tools/pack.mjs ship). The
// whole generators (gen-hunts, gen-hunt-sessions, gen-catalogues, gen-ground-tiers) keep re-issuing their tables whole, so:
//   A pack is FOLDED into a whole file when its own file comes BEFORE that file in tests/schema-apply-order.json: the whole
//   file's `delete` + re-insert would otherwise wipe its rows, so it must carry them. Every other pack (a staged one, one not
//   shipped, one shipped after the whole file) is left out, so adding a pack moves no whole file: its --check stays green and
//   nothing is re-issued. A world move (a new whole file, dated after the packs) folds every shipped pack with no edit.
// The view is exact, not a filter: the generator runs again with src/data/grounds/index.js naming the folded packs alone
// (./whole-hook.mjs, a module load hook), so every table derived from the data at import time follows.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, GROUNDS_DIR, packIds } from './files.mjs';

/** A pack's additive file name, read from its pack.js as text (no module evaluated), or null. */
export function packSqlOf(id, root = ROOT) {
  const m = readFileSync(join(GROUNDS_DIR(root), id, 'pack.js'), 'utf8').match(/^\s*sql:\s*"([^"]+)",?\s*$/m);
  return m ? m[1] : null;
}

/** The migrations in apply order (tests/schema-apply-order.json `order`). */
export function applyOrder(root = ROOT) { return JSON.parse(readFileSync(join(root, 'tests', 'schema-apply-order.json'), 'utf8')).order; }

/**
 * The packs a whole file `outName` carries: each pack whose own file sits before it in the apply order (a whole file not yet
 * in the order is the newest, so it carries every pack file that is). Sorted ids.
 */
export function foldedPacks(outName, root = ROOT, ids = packIds(root), order = applyOrder(root)) {
  const at = order.indexOf(outName), end = at < 0 ? order.length : at;
  return ids.filter((id) => { const f = packSqlOf(id, root); const i = f ? order.indexOf(f) : -1; return i >= 0 && i < end; }).sort();
}

const HOOK = pathToFileURL(join(fileURLToPath(new URL('.', import.meta.url)), 'whole-hook.mjs')).href;

/**
 * Run as a whole generator's first act when it runs as a script: answers true to go on (the view is in place, or every pack is
 * folded so the plain data IS the view). Otherwise runs the same script again under the view and exits with its status.
 * `env` HR_PACK_FOLD_ADD (comma ids) folds these packs too: tools/pack.mjs ship renders the whole files with its pack folded in.
 */
export function wholeViewOrRerun(scriptUrl, outName) {
  if (process.env.HR_WHOLE_VIEW === '1') return true;
  const ids = packIds();
  /* no pack: the data IS the whole view (a planted copy of the tree carries no apply order to read) */
  if (!ids.length) return true;
  const folded = [...foldedPacks(outName), ...(process.env.HR_PACK_FOLD_ADD || '').split(',').filter(Boolean)];
  if (ids.every((id) => folded.includes(id))) return true;
  const r = spawnSync(process.execPath, ['--import', HOOK, fileURLToPath(scriptUrl), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, HR_WHOLE_VIEW: '1', HR_WHOLE_PACKS: folded.join(',') } });
  process.exit(r.status == null ? 1 : r.status);
}

/** The view's index source, for the hook: src/data/grounds/index.js naming these packs alone. */
export { indexText } from './files.mjs';
export const existsPack = (id, root = ROOT) => existsSync(join(GROUNDS_DIR(root), id, 'pack.js'));

/**
 * THE ITEMS A WHOLE CATALOGUE DOES NOT CARRY (lane/b-muster-barrows): every item a ground pack adds when that pack is not folded into
 * the whole file `outName` (an apply-order name). A STAGED pack's items are served nowhere yet (it is never listed, nothing drops them);
 * a SHIPPED one's rows ride its own additive file, which comes after the whole file. src/data/items.js folds every pack in, so a guard
 * that holds items.js against the generated hr_items (tests/items-catalogue.mjs, tests/gold-intents.mjs G16) reads this, never a list:
 * { itemId: { pack, sql } }, `sql` the pack's own file (null while staged), whose hr_items rows the guard then holds instead.
 */
export async function itemsOutside(outName, root = ROOT) {
  const folded = new Set(foldedPacks(outName, root));
  const { GROUND_PACKS } = await import(pathToFileURL(join(root, 'src', 'data', 'grounds', 'index.js')).href);
  const out = {};
  for (const p of GROUND_PACKS) if (!folded.has(p.id)) for (const id of Object.keys(p.items || {})) out[id] = { pack: p.id, sql: p.sql || null };
  return out;
}

/** The ground packs a replayed chain never applies (tests/schema-apply-order.json): a staged pack (no file yet) and a shipped one whose
    file is not in the order. A guard that holds the data against the replayed server leaves their rows out (tests/hunt-tiers-db.mjs HT-6). */
export function unappliedPacks(root = ROOT, ids = packIds(root), order = applyOrder(root)) {
  return ids.filter((id) => { const f = packSqlOf(id, root); return !f || !order.includes(f); }).sort();
}
