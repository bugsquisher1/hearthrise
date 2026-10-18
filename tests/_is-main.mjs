// The ONE "am I the entry module?" test for every guard and tool (CLAUDE.md §4).
// Hand-rolled compares of import.meta.url (a file:// URL) against process.argv[1]
// (a backslash path on Windows) are false there, so the guard exits 0 having
// checked nothing. tests/guard-hygiene.mjs (rule ISMAIN-1) bans the hand-rolled form.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const norm = (p) => {
  const r = resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try { return norm(fileURLToPath(metaUrl)) === norm(argv1); } catch { return false; }
}
