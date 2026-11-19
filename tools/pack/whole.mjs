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
import { loadApplyOrder } from '../lib/apply-order.mjs';

/** A pack's additive file name, read from its pack.js as text (no module evaluated), or null. */
export function packSqlOf(id, root = ROOT) {
  const m = readFileSync(join(GROUNDS_DIR(root), id, 'pack.js'), 'utf8').match(/^\s*sql:\s*"([^"]+)",?\s*$/m);
  return m ? m[1] : null;
}

/** The migrations in apply order (tools/lib/apply-order.mjs; positions only, so a partial temp tree with the notes copied serves). */
export function applyOrder(root = ROOT) { return loadApplyOrder(root, { disk: false }).order; }

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
  /* a Set: a whole file that already folds a pack (the faction catalogue, after the March packs) is asked to fold it again by ship */
  /* HR_PACK_FOLD_DROP (comma ids) leaves these packs out even where the apply order folds them: ship's BEFORE render of a pack a later
     whole file already carries (the training-gear catalogues fold the March packs), so the pack's rows read as what it adds */
  const drop = (process.env.HR_PACK_FOLD_DROP || '').split(',').filter(Boolean);
  const folded = [...new Set([...foldedPacks(outName), ...(process.env.HR_PACK_FOLD_ADD || '').split(',').filter(Boolean)])].filter((id) => !drop.includes(id));
  if (ids.every((id) => folded.includes(id))) return true;
  const r = spawnSync(process.execPath, ['--import', HOOK, fileURLToPath(scriptUrl), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, HR_WHOLE_VIEW: '1', HR_WHOLE_PACKS: folded.join(',') } });
  process.exit(r.status == null ? 1 : r.status);
}

/** The view's index source, for the hook: src/data/grounds/index.js naming these packs alone. */
export { indexText } from './files.mjs';
export const existsPack = (id, root = ROOT) => existsSync(join(GROUNDS_DIR(root), id, 'pack.js'));
