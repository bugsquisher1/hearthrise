// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/bury.js — A STACK SPENT AT A BENCH: FUEL THE HEARTH, COOK ALL.
// (The `bury*` names are this module's word for "spend a stack at a bench"; they
// predate the Hearth and name no rite.)
//
// Tyler 2026-10-25: Inner Flame replaces Prayer and trains by FUELLING the Great
// Hearth in Havora's square with bones and the other fuels (src/data/hearth.js;
// src/data/recipes.js ARTISAN_RECIPES.inner_flame, one row per fuel, `output:null`).
// The bag offers "Fuel the hearth" (one) and, on a stack, "Fuel all N"; the server
// stands the hero at a free fuel stand by the fire (2027-01-28-town-stands.sql: an
// artisan Inner Flame pointer is the Hearth's) and the World walks it there.
// A NAMED fuel burns alone, by its own call (namedBlock / burnNamed below,
// src/session/hearth-intents.js). Playtest 10-22: Raw Wolf Meat sold for 1 gp
// because nothing in the game said it cooks — the same path cooks it: a raw
// item with a one-input Cooking recipe whose output is food (bag-model.js
// cookOf, from the recipe rows; no id list) offers Cook all.
//
// The server's path is the bench recipe: ONE `set_activity` naming
// { kind:'artisan', id:<recipe> }. The engine spends one at a time at its own
// pace from the SERVER's bag, pays the skill XP itself (never a client number),
// rolls the burn itself (cooking), refuses a recipe above the server's level
// (`activity_locked`), and stops on its own when the stack is gone (or after the
// count it was told: "Fuel the hearth" is a count of one). The bench runs
// wherever the hero is in town (a hunt's start ends it). Stop (or the timer below, when the stack should be done) is
// ONE `set_activity` { kind:'idle' }: the engine collects before it switches,
// and the re-read envelope replaces the bag and the skills. While the bag is
// open the run settles as it goes (src/session/town-poll.js), so the line says
// how far it has got from the server's bag ("12 cooked so far, 30 left"). The "Fueling…" /
// "Cooking…" line reads the server's pointer (state.active_kind / active_id),
// so it survives a reload.
//
// Start, the armed stop and Stop are src/shell/town-work.js's (one path with the
// Gathering and crafting window); this file names the stack's fuel or dish.
//
// A count rides the ONE set_activity (2026-12-01-bench-count.sql: the server stops
// the bench after that many); a dish is always the whole stack (Cook all).
// ════════════════════════════════════════════════════════════════════════
import { ARTISAN_RECIPES } from '../../../data/recipes.js?v=0.2.77';
import { SKILLS_DEF } from '../../../data/skills.js?v=0.2.77';
import { recipeInputs } from '../../../core/artisan.js?v=0.2.77';
import { whole } from '../../../render/format.js?v=0.2.77';
import { itemName } from '../../widgets/bits.js?v=0.2.77';
import { riteOf, cookOf } from '../../bag-model.js?v=0.2.77';
import { skillsOf, heldOf } from '../../../session/item-sections.js?v=0.2.77';
import { huntOf } from '../../../session/hunt-sections.js?v=0.2.77';
import { townActivityWords } from '../../../session/party-sections.js?v=0.2.77';
import { startWork, stopWork, workRow, workOf, runParts, doWords, workBlock } from '../../town-work.js?v=0.2.77';
import { skillShortWords } from '../../intent-words.js?v=0.2.77';
import { lineParts, lineText } from '../../town-ticker.js?v=0.2.77';
import { namedFuelOf } from '../../bag-model.js?v=0.2.77';
import { HUNT_INDEX } from '../../../data/hunts.js?v=0.2.77';
import { nameOf } from '../../../session/item-sections.js?v=0.2.77';
import { burnNamedFuel } from '../../../session/hearth-intents.js?v=0.2.77';

/* The Hearth's skill: every output-less bench row is a fuel (src/data/hearth.js). */
const FLAME = 'inner_flame';

/** The bench entry that spends a whole stack of `id` ({ skill, recipe, input, need }), or null. */
export function buryRecipeOf(id) { return riteOf(id) || cookOf(id); }

let BY_ID = null;
/* recipe id -> its entry, for the server's pointer (the same rows buryRecipeOf reads). */
function byRecipeId(rid) {
  if (!BY_ID) {
    BY_ID = new Map();
    for (const rows of Object.values(ARTISAN_RECIPES)) {
      for (const r of rows || []) {
        for (const input of Object.keys(recipeInputs(r))) { const e = buryRecipeOf(input); if (e && e.recipe === r) BY_ID.set(r.id, e); }
      }
    }
  }
  return BY_ID.get(rid) || null;
}

const skillName = (skill) => (SKILLS_DEF[skill] && SKILLS_DEF[skill].name) || skill;

/** The entry's verb: "Cook" for every dish, "Fuel" for every fuel. */
function buryVerb(e) { return e.skill === 'cooking' ? 'Cook' : 'Fuel'; }

/** "Cooking", "Fueling the Great Hearth with": the verb as the line under the bag says it (American spelling, 10-24). */
export function buryingWord(e) { return e.skill === 'cooking' ? 'Cooking' : 'Fueling the Great Hearth with'; }

/**
 * The label for `qty` units (pass buryQty: the bag + Storage the bench spends): "Cook" / "Cook all"; a fuel's is
 * "Fuel the hearth" for one and "Fuel all 120" for a stack (the board's item menu, Tyler 10-25).
 */
export function buryLabel(e, qty) {
  if (e.skill !== 'cooking') return qty > e.need ? 'Fuel all ' + whole(qty) : 'Fuel the hearth';
  return buryVerb(e) + (qty > e.need ? ' all' : '');
}

/**
 * How many of `id` a Bury all / Cook all spends: the server's bag PLUS the account's Storage where the server says
 * a bench draws on it (Tyler 2026-10-25, skills from Storage: the bag first, then Storage), else the bag.
 */
export function buryQty(cs, id) { return heldOf(cs)[id] || 0; }

/** The bench entry the server says this character is working now, or null. */
export function buryingOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  return s && s.active_kind === 'artisan' && typeof s.active_id === 'string' ? byRecipeId(s.active_id) : null;
}

/* "Brannoc is hunting in The Sewer; the Great Hearth is in town." (the board's refusal, Tyler 10-25: say why) */
function huntingWords(cs, h) {
  const hunt = h.huntId && HUNT_INDEX[h.huntId] ? HUNT_INDEX[h.huntId].name : null;
  return (nameOf(cs) || 'Your hero') + ' is hunting' + (hunt ? ' in ' + hunt : '') + '; the Great Hearth is in town.';
}

/** Why the stack cannot be spent now (plain words), or '' when it can. Every number is the server's. */
export function buryBlock(cs, e) {
  const on = buryingOf(cs);
  if (on) return 'Already ' + (on.skill === FLAME ? 'fueling the Great Hearth with ' + itemName(on.input) : buryingWord(on).toLowerCase()) + '. Stop it first.';
  const h = huntOf(cs);
  if (h && !h.ended) return e.skill === FLAME ? huntingWords(cs, h) : 'Not while a hunt is running.';
  const sk = skillsOf(cs);
  const lv = sk && sk[e.skill] ? sk[e.skill].level : null;
  const name = skillName(e.skill);
  if (lv === null) return 'Reading your ' + name + ' level…';
  /* "You need Cooking 15 to cook Raw Wolf Meat. You have 4." — the sentence the server's refusal reads as too (town-work.js). */
  if (lv < e.recipe.req) { const w = workRow('artisan', e.recipe.id); return skillShortWords(e.skill, e.recipe.req, lv, w ? doWords(w) : ''); }
  const qty = buryQty(cs, e.input);
  if (qty < e.need) return 'You need ' + e.need + ' ' + itemName(e.input) + ' for one. You have ' + whole(qty) + '.';
  /* The bag's room for the product, as the Work window says it (town-work.js workBlock: the engine's own test). */
  const why = workBlock(cs, workRow('artisan', e.recipe.id), false);
  if (/^Your bag is full/.test(why)) return why;
  return '';
}

/**
 * Start spending the stack `id`: ONE set_activity on its bench recipe, through the one town-work path
 * (src/shell/town-work.js), which arms the stop for when the stack should be done. `send(fn, busy, done)`
 * is the window's runIntent.
 */
export function startBury(cs, sc, id, send, repaint, count) {
  const e = buryRecipeOf(id);
  if (!e) return null;
  const qty = buryQty(cs, id);
  /* "Fuel the hearth" on a stack is a run of ONE (the bench's count); Fuel all / Cook all spend the stack */
  const n = e.skill === FLAME && count === 1 ? 1 : null;
  return startWork(cs, workRow('artisan', e.recipe.id), send, repaint, buryingWord(e) + ' ' + whole(n || qty) + ' ' + itemName(id) + '…', n);
}

/* ── A NAMED FUEL (src/data/hearth.js NAMED_FUELS): it burns alone, by one call the server decides whole ── */

/** Why the named fuel `id` cannot be burnt now (plain words), or '' when it can. Every number is the server's. */
export function namedBlock(cs, id) {
  const f = namedFuelOf(id);
  if (!f) return '';
  const h = huntOf(cs);
  if (h && !h.ended) return huntingWords(cs, h);
  if (!(heldOf(cs)[id] > 0)) return 'You have no ' + itemName(id) + ' in your bag.';
  const sk = skillsOf(cs);
  const lv = sk && sk[FLAME] ? sk[FLAME].level : null;
  if (lv === null) return 'Reading your ' + skillName(FLAME) + ' level…';
  /* "Den Knot needs Inner Flame 3. You have 1." (the board's words) */
  if (lv < f.req) return itemName(id) + ' needs ' + skillName(FLAME) + ' ' + f.req + '. You have ' + lv + '.';
  return '';
}

/**
 * Burn ONE named fuel (src/session/hearth-intents.js): the server's yes walks the hero to the fire and the square takes
 * its colour. `send(fn, busy, done)` is the window's runIntent; the line says what the server paid.
 */
export function burnNamed(account, cs, id, send) {
  /* a refusal reads through intent-words.js refusalText (the verb's own words, the server's numbers) */
  return send(() => burnNamedFuel(account, cs, id), 'Fueling the Great Hearth…',
    (r) => '+' + whole(r.xp || 0) + ' ' + skillName(FLAME) + ' XP. The fire takes your ' + itemName(id) + '.');
}

/** Stop: ONE set_activity idle (town-work.js stopWork); the engine pays what was spent first. */
export function stopBury(cs, sc, send) {
  return stopWork(cs, send);
}

/**
 * The "Burying…" / "Cooking…" line as parts (town-ticker.js paintLine), or [] when the hero is free. Every
 * other town activity the server holds (gathering, a workbench, training: a
 * resumed one the player never started here) is named too, with the same Stop,
 * so nothing runs unseen (live v0.2.11). A hunt's start ends it on the server anyway.
 */
export function buryParts(cs) {
  const e = buryingOf(cs);
  /* How far it has got: the server's bag and the ticker's pending part (town-work.js runParts); the open bag settles it as it goes. */
  if (e) return lineParts(buryingWord(e) + ' ' + itemName(e.input), runParts(cs, workOf(cs)), '. Your bag and ' + skillName(e.skill) + ' XP update as it goes.');
  const s = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  const words = townActivityWords(s);
  return words ? [{ key: 'lead', text: 'Your hero is ' + words + '. Starting a hunt ends it, or stop it here.' }] : [];
}

/** The same line as words, or '' when the hero is free. */
export function buryLine(cs) { return lineText(buryParts(cs)); }
