// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/bury.js — A WHOLE STACK SPENT AT A BENCH: BURY ALL, COOK ALL.
//
// Tyler 10-14: Prayer trains by burying bones (and the other Prayer offerings:
// src/data/recipes.js ARTISAN_RECIPES.prayer, one row per item, `output:null`).
// Tyler live 10-18 (v0.2.1): "can't bury bones" — the server path existed, the
// new client never offered it. Playtest 10-22: Raw Wolf Meat sold for 1 gp
// because nothing in the game said it cooks — the same path cooks it: a raw
// item with a one-input Cooking recipe whose output is food (bag-model.js
// cookOf, from the recipe rows; no id list) offers Cook all.
//
// The server's path is the bench recipe: ONE `set_activity` naming
// { kind:'artisan', id:<recipe> }. The engine spends one at a time at its own
// pace from the SERVER's bag, pays the skill XP itself (never a client number),
// rolls the burn itself (cooking), refuses a recipe above the server's level
// (`activity_locked`), and stops on its own when the stack is gone. No fire or
// station is asked for: the bench runs wherever the hero is in town (a hunt's
// start ends it). Stop (or the timer below, when the stack should be done) is
// ONE `set_activity` { kind:'idle' }: the engine collects before it switches,
// and the re-read envelope replaces the bag and the skills. While the bag is
// open the run settles as it goes (src/session/town-poll.js), so the line says
// how far it has got from the server's bag ("12 cooked so far, 30 left"). The "Burying…" /
// "Cooking…" line reads the server's pointer (state.active_kind / active_id),
// so it survives a reload.
//
// Start, the armed stop and Stop are src/shell/town-work.js's (one path with the
// Gathering and crafting window); this file names the stack's rite or dish.
//
// The engine spends the WHOLE stack: it has no "this many" for a recipe, so a
// partial run would be a client guess at the server's clock. It is not offered.
// ════════════════════════════════════════════════════════════════════════
import { ARTISAN_RECIPES } from '../../../data/recipes.js?v=0.2.43';
import { SKILLS_DEF } from '../../../data/skills.js?v=0.2.43';
import { recipeInputs } from '../../../core/artisan.js?v=0.2.43';
import { whole } from '../../../render/format.js?v=0.2.43';
import { itemName } from '../../widgets/bits.js?v=0.2.43';
import { riteOf, cookOf } from '../../bag-model.js?v=0.2.43';
import { skillsOf } from '../../../session/item-sections.js?v=0.2.43';
import { huntOf } from '../../../session/hunt-sections.js?v=0.2.43';
import { townActivityWords } from '../../../session/party-sections.js?v=0.2.43';
import { startWork, stopWork, workRow, workOf, runParts } from '../../town-work.js?v=0.2.43';
import { lineParts, lineText } from '../../town-ticker.js?v=0.2.43';

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

/** The entry's verb: "Cook" for every dish; a rite's own ("Bury", "Offer", "Scatter"…) from its name. */
export function buryVerb(e) { return e.skill === 'cooking' ? 'Cook' : String(e.recipe.name).split(' ')[0]; }

/** "Burying", "Offering", "Cooking": the verb as the line under the bag says it. */
export function buryingWord(e) { const v = buryVerb(e); return (/[^e]e$/.test(v) ? v.slice(0, -1) : v) + 'ing'; }

/** The label for a stack of `qty`: "Bury" for one, "Bury all" for more. */
export function buryLabel(e, qty) { return buryVerb(e) + (qty > e.need ? ' all' : ''); }

/** The bench entry the server says this character is working now, or null. */
export function buryingOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  return s && s.active_kind === 'artisan' && typeof s.active_id === 'string' ? byRecipeId(s.active_id) : null;
}

/** Why the stack cannot be spent now (plain words), or '' when it can. Every number is the server's. */
export function buryBlock(cs, e) {
  const on = buryingOf(cs);
  if (on) return 'Already ' + buryingWord(on).toLowerCase() + '. Stop it first.';
  const h = huntOf(cs);
  if (h && !h.ended) return 'Not while a hunt is running.';
  const sk = skillsOf(cs);
  const lv = sk && sk[e.skill] ? sk[e.skill].level : null;
  const name = skillName(e.skill);
  if (lv === null) return 'Reading your ' + name + ' level…';
  if (lv < e.recipe.req) return 'Needs ' + name + ' ' + e.recipe.req + ' (you have ' + lv + ').';
  const qty = (cs.read('inventory') || {})[e.input] || 0;
  if (qty < e.need) return 'Needs ' + e.need + ' ' + itemName(e.input) + ' for one.';
  return '';
}

/**
 * Start spending the stack `id`: ONE set_activity on its bench recipe, through the one town-work path
 * (src/shell/town-work.js), which arms the stop for when the stack should be done. `send(fn, busy, done)`
 * is the window's runIntent.
 */
export function startBury(cs, sc, id, send, repaint) {
  const e = buryRecipeOf(id);
  if (!e) return null;
  const qty = (cs.read('inventory') || {})[id] || 0;
  return startWork(cs, workRow('artisan', e.recipe.id), send, repaint, buryingWord(e) + ' ' + whole(qty) + ' ' + itemName(id) + '…');
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
