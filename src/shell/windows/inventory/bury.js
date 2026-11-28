// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/bury.js — A STACK BURNED IN THE GREAT HEARTH, AND A RAW FOOD'S WAY TO ITS JOB.
// (The `bury*` names are this module's word for "spend a stack at the Hearth"; they predate the Hearth and name no rite.)
//
// Tyler 2026-10-25: Inner Flame trains by FUELLING the Great Hearth in Havora's square with bones and the other fuels
// (src/data/hearth.js; src/data/recipes.js ARTISAN_RECIPES.inner_flame, one `fuel_<item>` row per fuel, `output:null`). The bag offers
// "Burn" (one) and, on a stack, "Burn all N" (Tyler 2026-11-18). The fuel runs are the bridge the bench cut keeps until the company
// flame lights (09-crafting 4.17, 4.13 row 3): ONE `set_activity` { kind:'artisan', id:'fuel_<item>', count? }. The engine burns one at
// a time from the SERVER's bag, then Storage, pays the Inner Flame XP itself, refuses a fuel above the server's level and stops on its
// own when the stack is gone (or after the count: "Burn" is a run of one). Stop is ONE `set_activity` { kind:'idle' }: the engine
// collects first. While the bag or the Work window is open the run settles as it goes (src/session/town-poll.js), and an unwatched one
// is settled once the server's own record says it is spent (hearth-sections.js fuelSpentAtMs, the shell's display tick).
// A NAMED fuel burns alone, by its own call (namedBlock / burnNamed below, src/session/hearth-intents.js).
//
// COOK IS A JOB (09 4.17: no bench). A raw food a Cooking job takes (bag-model.js cookOf, from the job recipes) offers Cook, a link to
// that job's row in the Work window's Jobs list (src/shell/windows/work-jobs.js); the job's quote, fee and hours are the server's there.
// Every number here is the server's envelope; nothing here moves one.
// ════════════════════════════════════════════════════════════════════════
import { SKILLS_DEF } from '../../../data/skills.js';
import { whole } from '../../../render/format.js';
import { t } from '../../../render/player-text.js';
import { itemName, itemNameFor } from '../../widgets/bits.js';
import { riteOf, cookOf, namedFuelOf } from '../../bag-model.js';
import { targetOf } from '../../goto.js';
import { skillsOf, heldOf, nameOf } from '../../../session/item-sections.js';
import { huntOf } from '../../../session/hunt-sections.js';
import { townActivityWords } from '../../../session/party-sections.js';
import { fuelRowOf, fuelRunOf } from '../../../session/hearth-sections.js';
import { burnNamedFuel } from '../../../session/hearth-intents.js';
import { busyWords } from '../../training-words.js';

/* The Hearth's skill: every output-less row is a fuel (src/data/hearth.js). */
const FLAME = 'inner_flame';
const skillName = (skill) => (SKILLS_DEF[skill] && SKILLS_DEF[skill].name) || skill;
const levelIn = (cs, skill) => { const sk = skillsOf(cs); return sk && sk[skill] && Number.isInteger(sk[skill].level) ? sk[skill].level : null; };
const xpIn = (cs, skill) => { const sk = skillsOf(cs); return sk && sk[skill] && Number.isSafeInteger(sk[skill].xp) ? sk[skill].xp : null; };

/** The Hearth entry that burns a stack of `id` ({ skill, recipe, input, need }), or null. */
export function buryRecipeOf(id) { return riteOf(id); }

/** Where the bag's Cook takes a raw food: its Cooking job's row in the Work window's Jobs list (goto.js), or null when no job cooks it. */
export function cookTarget(id) {
  const j = cookOf(id);
  return j ? targetOf({ kind: 'job', job: j.id }) : null;
}

/** "Fueling the Great Hearth with": the verb as the line under the bag says it (American spelling, 10-24). */
export function buryingWord() { return 'Fueling the Great Hearth with'; }

/**
 * The label for `qty` units (pass buryQty: the bag + Storage the run burns): "Burn" for one and "Burn all 120" for a stack (the board's
 * item menu, Tyler 10-25; "Burn", Tyler 11-18). While this stack is the one burning, a count would be the last settle's: `cs` given, it
 * says what is happening; the line under the bag has the live count and its Stop.
 */
export function buryLabel(e, qty, cs) {
  if (cs && buryingOf(cs) === e) return 'Fueling…';
  return qty > e.need ? 'Burn all ' + whole(qty) : 'Burn';
}

/** How many of `id` a Burn all spends: the server's bag PLUS the account's Storage where the server says a run draws on it. */
export function buryQty(cs, id) { return heldOf(cs)[id] || 0; }

/** The Hearth entry the server says this character is burning now, or null. */
export function buryingOf(cs) {
  const row = fuelRunOf(cs);
  return row ? riteOf(row.item) : null;
}

/** Why the stack cannot be burned now (plain words), or '' when it can. Every number is the server's. */
export function buryBlock(cs, e) {
  const on = buryingOf(cs);
  if (on) return 'Already fueling the Great Hearth with ' + itemName(on.input) + '. Stop it first.';
  const h = huntOf(cs);
  if (h && !h.ended) return busyWords(cs, 'Great Hearth is in town');
  const lv = levelIn(cs, e.skill);
  if (lv === null) return 'Loading ' + skillName(e.skill) + ' level…';
  if (lv < (e.recipe.req || 1)) return itemName(e.input) + ': requires ' + skillName(e.skill) + ' ' + e.recipe.req;
  const qty = buryQty(cs, e.input);
  if (qty < e.need) return 'Need ' + e.need + ' ' + itemNameFor(e.input, e.need) + ', have ' + whole(qty);
  return '';
}

/* The numbers a run started from (display only): the server's Inner Flame XP and the stack, for the Stop's line. */
const FROM = new WeakMap();

/**
 * Start burning the stack `id`: ONE set_activity on its fuel row. `send(fn, busy, done)` is the window's runIntent. "Burn" on a stack is a
 * run of ONE (`count` 1); Burn all sends no count and burns the stack. Returns send's promise, or null when `id` is no fuel.
 */
export function startBury(cs, sc, id, send, repaint, count) {
  const e = buryRecipeOf(id);
  const row = e ? fuelRowOf(e.recipe.id) : null;
  if (!row) return null;
  const n = count === 1 ? 1 : null;
  const qty = n || buryQty(cs, id);
  const activity = { kind: 'artisan', id: row.id, ...(n ? { count: n } : {}) };
  /* the engine refuses a fuel above the server's level as `activity_locked`; for the Hearth that is Inner Flame, not a hunt, and the
     words name it with both levels (intent-words.js skillShortWords) */
  const levelWords = (r) => (r && !r.ok && r.error === 'activity_locked'
    ? Object.assign({}, r, { error: 'level_too_low', skill: { id: FLAME, need: row.req, have: levelIn(cs, FLAME) } }) : r);
  return send(() => cs.edgeIntent('set_activity', { activity }).then(levelWords), t('work.job_starting'), () => {
    FROM.set(cs, { id: row.id, item: row.item, xp: xpIn(cs, FLAME), held: buryQty(cs, row.item) });
    return buryingWord() + ' ' + whole(qty) + ' ' + itemNameFor(id, qty) + '…';
  });
}

/** Stop: ONE set_activity idle; the engine pays what was burned first. The line says what the server's two envelopes differ by. */
export function stopBury(cs, sc, send) {
  const row = fuelRunOf(cs);
  const was = FROM.get(cs);
  const from = row && was && was.id === row.id ? was : row ? { id: row.id, item: row.item, xp: xpIn(cs, FLAME), held: buryQty(cs, row.item) } : null;
  return send(() => cs.edgeIntent('set_activity', { activity: { kind: 'idle' } }), t('work.job_stopping'), () => {
    FROM.delete(cs);
    if (!from) return t('work.job_stopped');
    const burned = Math.max(0, from.held - buryQty(cs, from.item));
    const lv = levelIn(cs, FLAME);
    return t('work.done_fuel', { name: nameOf(cs) || t('away.your_hero'), count: whole(burned), item: itemNameFor(from.item, burned) })
      + (lv !== null ? ' · ' + t('work.done_level', { skill: skillName(FLAME), level: lv }) : '');
  });
}

/* ── A NAMED FUEL (src/data/hearth.js NAMED_FUELS): it burns alone, by one call the server decides whole ── */

/** Why the named fuel `id` cannot be burnt now (plain words), or '' when it can. Every number is the server's. */
export function namedBlock(cs, id) {
  const f = namedFuelOf(id);
  if (!f) return '';
  const h = huntOf(cs);
  if (h && !h.ended) return busyWords(cs, 'Great Hearth is in town');
  if (!(heldOf(cs)[id] > 0)) return 'No ' + itemName(id) + ' in bag';
  const lv = levelIn(cs, FLAME);
  if (lv === null) return 'Loading ' + skillName(FLAME) + ' level…';
  /* "Den Knot: requires Inner Flame 3" (the board's words) */
  if (lv < f.req) return itemName(id) + ': requires ' + skillName(FLAME) + ' ' + f.req;
  return '';
}

/**
 * Burn ONE named fuel (src/session/hearth-intents.js): the server's yes walks the hero to the fire and the square takes
 * its colour. `send(fn, busy, done)` is the window's runIntent; the line says what the server paid.
 */
export function burnNamed(account, cs, id, send) {
  /* a refusal reads through intent-words.js refusalText (the verb's own words, the server's numbers) */
  return send(() => burnNamedFuel(account, cs, id), 'Fueling the Great Hearth…',
    (r) => '+' + whole(r.xp || 0) + ' ' + skillName(FLAME) + ' XP');
}

/**
 * The line under the bag, or '' when the hero is free: the run the server holds and what its bag and Storage still hold of the fuel
 * ("Fueling the Great Hearth with Bones · 120 left"), or any other town activity the server holds (a training session: a resumed one the
 * player never started here), with the same Stop, so nothing runs unseen (live v0.2.11). A hunt's start ends it on the server anyway.
 */
export function buryLine(cs) {
  const e = buryingOf(cs);
  if (e) return buryingWord() + ' ' + itemName(e.input) + ' · ' + t('work.now_left', { n: whole(buryQty(cs, e.input)) });
  const s = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  const words = townActivityWords(s);
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}
