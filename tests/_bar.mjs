// ════════════════════════════════════════════════════════════════════════
// tests/_bar.mjs — A WINDOW'S WAY IN FROM THE TOP BAR, AS A PLAYER PRESSES IT (the bar's groups, 2026-11-16).
//
// A window's icon stands in the row, or sits in its group's menu (src/data/shell-windows.js `group`): a press on the
// group's icon opens the menu, a press on the window's line opens it. pressBar makes those presses for a test, read
// from the catalogue, so no test types which group a window lives in. It answers the presses it made (1 or 2) and
// throws like a Playwright click when a control is missing (a caller that only tries keeps its own `.catch`).
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { SHELL_WINDOWS } = await import(pathToFileURL(join(ROOT, 'src/data/shell-windows.js')).href);

/** The group a window's icon lives in, or null (its icon stands in the row). */
export const groupOf = (id) => { const r = SHELL_WINDOWS.find((w) => w.id === id); return r && r.group ? r.group : null; };

/** The selector of a window's control in the bar: its icon, or its line in its group's open menu. */
export const barItem = (id) => (groupOf(id) ? '.hs-launch-menu [data-hs-open="' + id + '"]' : '.hs-launchers > .hs-launch[data-hs-open="' + id + '"]');

/**
 * Press window `id`'s way in from the top bar. `o.tap`: a touch tap (a phone); `o.timeout` per press (default 2500 ms).
 * A grouped window: its group's icon (unless the menu is open already), then its line.
 */
export async function pressBar(page, id, o = {}) {
  const opts = { timeout: o.timeout || 2500 };
  const press = (q) => (o.tap ? page.tap(q, opts) : page.click(q, opts));
  const g = groupOf(id);
  if (!g) { await press(barItem(id)); return 1; }
  if (!(await page.$(barItem(id)))) await press('.hs-launchers [data-hs-group="' + g + '"]');
  await press(barItem(id));
  return 2;
}

/** Every window the bar reaches, as [id, group|null], in the row's order (the browser's, not the catalogue's). */
export const barReach = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.hs-launchers > .hs-launch, .hs-launchers > .hs-launch-group > .hs-launch'))
  .map((b) => b.getAttribute('data-hs-open') || 'group:' + b.getAttribute('data-hs-group')));
