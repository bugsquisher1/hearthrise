// ════════════════════════════════════════════════════════════════════════
// src/shell/station-sort.js — THE ORDER OF A CRAFTING STATION'S RECIPES, THE PLAYER'S PICK.
//
// Andy (playtester, Discord 2026-11-11): "Do you have it scoped to add sorting at crafting
// stations?" A bench skill's recipe list (src/shell/windows/work.js rowsFor) comes in one of
// three orders, picked in a Sort menu at the top of the list:
//   can    Can make, the default and the order the list had before the pick: what the server's
//          bag and Storage make now first, then the highest required level; the locked rows last
//   level  Level: the required level, low to high
//   name   Name: the recipe's name, A to Z
// Every sort orders the SAME rows (all at or under the server's level, then the next locked
// ones), so a locked recipe stays in view under any sort; only the order moves. Each row's
// numbers and gates are still the server's (work.js patchRow).
//
// The pick is kept per station (a bench skill) and per hero in the residue `stationSort`
// (src/session/residue.js): a display preference that gates and spends nothing, put to the
// server and read back from it after a reload. The default is kept as no entry at all.
//
//   STATION_SORTS                 the sort ids, in the menu's order
//   stationSortOf(residue, skill) the pick remembered for this station, else 'can'
//   withStationSort(r, skill, s)  the residue field with this station's pick (a fresh object)
//   orderStation(open, ahead, sort, canMake)   the rows in the picked order (a fresh array)
//   sortMenuHtml() / patchSortMenu(box, show, sort)   the menu, built once and patched in place
// ════════════════════════════════════════════════════════════════════════
import { t } from '../render/player-text.js?v=0.2.122';
import { prop } from '../render/paint.js?v=0.2.122';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.122';

/** id -> its menu label's text row. */
const LABELS = Object.freeze({ can: 'work.sort_can', level: 'work.sort_level', name: 'work.sort_name' });
export const STATION_SORTS = Object.freeze(Object.keys(LABELS));
export const DEFAULT_SORT = 'can';
const own = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

/** The order this hero last picked at this station (residue `stationSort`), else Can make. */
export function stationSortOf(residue, skill) {
  const v = own(residue, 'stationSort') ? residue.stationSort : null;
  const s = own(v, skill) ? v[skill] : null;
  return own(LABELS, s) ? s : DEFAULT_SORT;
}

/** The residue field after a pick at one station, every other station's pick kept; the default is no entry. Null for an unknown sort. */
export function withStationSort(residue, skill, sort) {
  if (!own(LABELS, sort) || typeof skill !== 'string' || !skill) return null;
  const out = Object.assign({}, own(residue, 'stationSort') && residue.stationSort && typeof residue.stationSort === 'object' ? residue.stationSort : {});
  if (sort === DEFAULT_SORT) delete out[skill];
  else out[skill] = sort;
  return out;
}

const reqOf = (w) => w.row.req || 1;
const byName = (a, b) => String(a.row.name).localeCompare(String(b.row.name), 'en');

/**
 * The rows a station lists, in the picked order: `open` (at or under the server's level) and `ahead` (the next
 * locked ones, lowest first), as one fresh array. Ties keep the catalogue's order (the sorts are stable).
 * `canMake(w)`: whether the server's bag and Storage cover one run now.
 */
export function orderStation(open, ahead, sort, canMake) {
  const all = open.concat(ahead);
  if (sort === 'level') return all.sort((a, b) => reqOf(a) - reqOf(b));
  if (sort === 'name') return all.sort(byName);
  const can = (w) => (canMake(w) ? 1 : 0);
  return open.slice().sort((a, b) => can(b) - can(a) || reqOf(b) - reqOf(a)).concat(ahead);
}

/** The Sort menu over a station's recipes (hidden until a bench skill is open). */
export function sortMenuHtml() {
  return '<div class="hw-work-sort" hidden><label class="hw-sort"><span>' + esc(t('work.sort')) + '</span>'
    + '<select class="hh-select" data-hs-act="station-sort">'
    + STATION_SORTS.map((id) => '<option value="' + id + '">' + esc(t(LABELS[id])) + '</option>').join('')
    + '</select></label></div>';
}

/** Show the menu (a bench skill) or hide it (gathering), set to the remembered sort. */
export function patchSortMenu(box, show, sort) {
  if (!box) return;
  prop(box, 'hidden', !show);
  prop(box.querySelector('select'), 'value', sort);
}
