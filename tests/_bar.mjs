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

/** A window with a way in from the row (its icon or its group's line); a row kept off the bar (launcher: false) has none. */
export const hasIcon = (id) => { const r = SHELL_WINDOWS.find((w) => w.id === id); return !!r && r.launcher !== false; };

/** The selector of the row's icon a player presses first for window `id`: its own, or its group's. */
export const rowIcon = (id) => (groupOf(id) ? '.hs-launchers [data-hs-group="' + groupOf(id) + '"]' : '.hs-launchers > .hs-launch[data-hs-open="' + id + '"]');

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

/** The row's buttons in the browser's order: a window's id, or 'group:<id>' for a group's icon. */
export const barReach = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.hs-launchers > .hs-launch, .hs-launchers > .hs-launch-group > .hs-launch'))
  .map((b) => b.getAttribute('data-hs-open') || 'group:' + b.getAttribute('data-hs-group')));

/**
 * The windows group `g`'s menu lists, as the page draws them (a Game Master's tools, a section's window: only where the page offers
 * them). A shut menu is opened for the read and shut again by a second press on its icon; [] when the row has no such icon.
 */
export async function menuLines(page, g, o = {}) {
  const icon = '.hs-launchers [data-hs-group="' + g + '"]';
  if (!(await page.$(icon))) return [];
  const read = () => page.evaluate((x) => { const m = document.querySelector('[data-hs-group-box="' + x + '"] .hs-launch-menu');
    return m ? Array.from(m.querySelectorAll('[data-hs-open]')).map((b) => b.getAttribute('data-hs-open')) : null; }, g);
  const was = await read();
  if (was) return was;
  const press = () => (o.tap ? page.tap(icon, { timeout: o.timeout || 2500 }) : page.click(icon, { timeout: o.timeout || 2500 }));
  await press();
  const ids = (await read()) || [];
  await press();
  return ids;
}

/** Every window the top bar reaches, in the row's order: each icon's window, and each group's lines (menuLines). */
export async function barWindows(page, o = {}) {
  const out = [];
  for (const x of await barReach(page)) out.push(...(x.startsWith('group:') ? await menuLines(page, x.slice(6), o) : [x]));
  return out;
}
