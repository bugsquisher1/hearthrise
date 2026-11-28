// ════════════════════════════════════════════════════════════════════════
// src/shell/town-news.js — TWO THINGS THAT HAPPEN IN TOWN, SAID ONCE (full-game audit 2026-11-18 A17, A24).
//
// "Feed the Hearth, Fuel all" ended with no word of what it did (only the Character window showed the new Inner Flame), and titles
// unlocked with nobody told: "Ratcatcher: Rats 10,261 of 2,500, Claim for 1,500 gp" sat in Character, Titles, found by chance. Both
// are now one line through the alert centre (src/shell/alerts.js), each told once by its id:
//   workDoneOf(cs, saw)      a fuel run into the Great Hearth this page watched (runningRunOf: the alert centre keeps the first read it
//                            saw of the run) that the server says ended on its own, its fuel used up: "Ashwick: 14 Bones burned in the
//                            Great Hearth · Inner Flame 3". The count is the difference of two server reads of the bag and Storage, the
//                            level the server's. A run that ended while the page was away is the away card's (./away-work.js); a run the
//                            player stopped says so on its own Stop (windows/inventory/bury.js), and one still holding fuel is that.
//   titleNewsOf(cs, told)    the titles the server says this hero has earned and not claimed (`titles`: its kills reached, not held),
//                            those not told yet: one line for all of them, each title's id beside it, so each is told once.
// Pure readers of the envelope: nothing here gates, prices or spends.
// ════════════════════════════════════════════════════════════════════════
import { titlesOf } from '../session/character-sections.js';
import { nameOf, skillsOf, heldOf } from '../session/item-sections.js';
import { fuelRowOf, fuelRunOf } from '../session/hearth-sections.js';
import { TITLES } from '../data/titles.js';
import { whole, gold } from '../render/format.js';
import { t } from '../render/player-text.js';
import { itemNameFor, skillName } from './widgets/bits.js';

const FLAME = 'inner_flame';

/** The fuel run the server says runs now, as the alert centre keeps it: { key, id, item, held } (its recipe and start, the pointer's
    active_since, and what the server's bag and Storage held of the fuel at this read), or null when none runs. The pointer, not a tally:
    a short run can be paid whole by the first settle, so its tally is never seen running (played: Fuel all of 14 Bones). */
export function runningRunOf(cs) {
  const row = fuelRunOf(cs);
  const st = row ? cs.read('state') : null;
  const since = st && typeof st.active_since === 'string' ? Date.parse(st.active_since) : NaN;
  return row && Number.isFinite(since) ? { key: row.id + ':' + since, id: row.id, item: row.item, held: (heldOf(cs) || {})[row.item] || 0 } : null;
}

/** The line for the run `saw` names once the server says it ended with its fuel used up, or null. */
export function workDoneOf(cs, saw) {
  const row = saw ? fuelRowOf(saw.id) : null;
  const now = runningRunOf(cs);
  if (!row || (now && now.key === saw.key)) return null;
  const left = (heldOf(cs) || {})[row.item] || 0;
  const n = saw.held - left;
  if (left >= row.need || !(n > 0)) return null;
  const sk = (skillsOf(cs) || {})[FLAME];
  const said = t('work.done_fuel', { name: nameOf(cs) || t('away.your_hero'), count: whole(n), item: itemNameFor(row.item, n) });
  return { id: 'work:' + saw.key, kind: 'work', session: null,
    text: said + (sk ? ' · ' + t('work.done_level', { skill: skillName(FLAME), level: sk.level }) : '') };
}

/** The line for the titles earned and not claimed that `told` has not seen, or null. `also`: the other titles' ids, told with it. */
export function titleNewsOf(cs, told) {
  const titles = titlesOf(cs);
  const ready = titles ? titles.rows.filter((r) => !r.held && r.have >= r.kills && !told('title:' + r.id)) : [];
  if (!ready.length) return null;
  const first = ready[0];
  const title = TITLES[first.id] ? TITLES[first.id].name : first.words;
  const name = nameOf(cs) || t('away.your_hero');
  const more = ready.length - 1;
  const text = more > 0 ? t('heroes.title_ready_more', { name, title, count: more })
    : t(first.price > 0 ? 'heroes.title_ready' : 'heroes.title_ready_free', { name, title, price: gold(first.price) });
  return { id: 'title:' + first.id, also: ready.slice(1).map((r) => 'title:' + r.id), kind: 'title', session: null, text };
}
