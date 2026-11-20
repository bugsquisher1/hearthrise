// ════════════════════════════════════════════════════════════════════════
// src/shell/town-news.js — TWO THINGS THAT HAPPEN IN TOWN, SAID ONCE (full-game audit 2026-11-18 A17, A24).
//
// "Feed the Hearth, Fuel all" ended with no word of what it did (only the Character window showed the new Inner Flame), and titles
// unlocked with nobody told: "Ratcatcher: Rats 10,261 of 2,500, Claim for 1,500 gp" sat in Character, Titles, found by chance. Both
// are now one line through the alert centre (src/shell/alerts.js), each told once by its id:
//   workDoneOf(cs, sawKey)   a bench run this page watched (runningRunKey: the alert centre keeps the key it saw running) that the
//                            server says ended on its own, its inputs used up or its count made (`bench_tax.run`'s stop): "Ashwick
//                            fueled the Great Hearth with 14 Bones. Inner Flame 3." The run's count and the skill's level are the
//                            server's. A run that ended while the page was away is the away card's (./away-work.js); a stop for gold
//                            has its own line (./bench-fee.js).
//   titleNewsOf(cs, told)    the titles the server says this hero has earned and not claimed (`titles`: its kills reached, not held),
//                            those not told yet: one line for all of them, each title's id beside it, so each is told once.
// Pure readers of the envelope: nothing here gates, prices or spends.
// ════════════════════════════════════════════════════════════════════════
import { benchRunOf } from '../session/bench-sections.js';
import { titlesOf } from '../session/character-sections.js';
import { nameOf, skillsOf } from '../session/item-sections.js';
import { recipeInputs } from '../core/artisan.js';
import { TITLES } from '../data/titles.js';
import { whole, gold } from '../render/format.js';
import { t } from '../render/player-text.js';
import { itemName, itemNameFor, skillName } from './widgets/bits.js';
import { workRow, productOf, yieldOf } from './town-work.js';

/* The stops that mean the run finished on its own: an input used up, the count made (supabase/functions/hr-accrue/accrual.js `stopped`). */
const FINISHED = new Set(['supplies', 'count']);
const runKey = (run) => run.recipe + ':' + run.since;

/** The key of the bench job the server says runs now: its recipe and start, from the activity pointer (`state.active_*`), the same pair
    the run's tally is keyed by (2027-02-19-bench-tax.sql: one run is one recipe and active_since). The pointer, not the tally: a short run
    can be paid whole by the first settle, so its tally is never seen running (played: Fuel all of 14 Bones). Null when none runs. */
export function runningRunKey(cs) {
  const st = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  const since = st && typeof st.active_since === 'string' ? Date.parse(st.active_since) : NaN;
  return st && st.active_kind === 'artisan' && typeof st.active_id === 'string' && workRow('artisan', st.active_id) && Number.isFinite(since)
    ? st.active_id + ':' + since : null;
}

/** The line for the run `sawKey` names once the server says it finished on its own, or null. */
export function workDoneOf(cs, sawKey) {
  const run = benchRunOf(cs);
  if (!run || !FINISHED.has(run.end) || !Number.isFinite(run.since) || runKey(run) !== sawKey || !(run.crafts > 0)) return null;
  const w = workRow('artisan', run.recipe);
  if (!w) return null;
  const name = nameOf(cs) || t('away.your_hero');
  const product = productOf(w);
  const sk = (skillsOf(cs) || {})[w.skill];
  let said;
  if (product) {
    /* a count only where every craft makes the product: a dish can burn and a rolled piece comes in grades, and the run's tally counts
       crafts, not what they made, so those say the run without a number rather than one the bag disagrees with */
    const exact = w.skill !== 'cooking' && !w.row.roll;
    const n = run.crafts * yieldOf(w);
    if (exact) said = t('work.done_made', { name, count: whole(n), item: itemNameFor(product, n) });
    else said = t('work.done_run', { name, item: itemName(product) });
  } else {
    /* a Hearth fuel makes nothing: what it burned, its one input */
    const [input, per] = Object.entries(recipeInputs(w.row))[0] || [];
    if (!input) return null;
    const n = run.crafts * (Number(per) || 1);
    said = t('work.done_fuel', { name, count: whole(n), item: itemNameFor(input, n) });
  }
  return { id: 'work:' + runKey(run), kind: 'work', session: null,
    text: said + (sk ? ' ' + t('work.done_level', { skill: skillName(w.skill), level: sk.level }) : '') };
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
