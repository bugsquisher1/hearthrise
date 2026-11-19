// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/pattern.js — LEARNING A PATTERN FROM THE BAG (src/data/patterns.js; the server half is
// supabase/migrations/2026-09-14-recipe-learn.sql hr_recipe_learn).
//
// A pattern's primary press and its menu's "Learn" are ONE intent (src/session/recipe-intents.js learnRecipe), for THIS hero: the server
// takes one from its bag and the recipe opens for it alone. Off, with why, only for what the screen already knows from the server's own
// learned set (bench-sections.js learnedRecipesOf): this hero knows it already, so the pattern is kept to sell, store or give to another
// hero. The bench opens only from the re-read envelope (town-work.js workBlock).
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../../data/items.js?v=0.2.140';
import { workRow } from '../../town-work.js?v=0.2.140';
import { learnedRecipesOf } from '../../../session/bench-sections.js?v=0.2.140';
import { learnRecipe } from '../../../session/recipe-intents.js?v=0.2.140';
import { t } from '../../../render/player-text.js?v=0.2.140';

/** The bench row item `id` is the pattern of ({ kind, id, skill, row }, town-work.js workRow), or null. Pure. A pattern names its recipe
    (`teaches`) and that recipe's gate names the pattern back, so a stray field can't make a Learn the server would refuse. */
export function patternRowOf(id) {
  const it = Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
  const w = it && typeof it.teaches === 'string' ? workRow('artisan', it.teaches) : null;
  return w && w.row.gated === id ? w : null;
}

/** Why Learn is off for pattern `id` now ('' when the server is to judge): this hero has learned it, by the server's set. */
export function learnBlock(cs, id) {
  const known = patternRowOf(id) ? learnedRecipesOf(cs) : null;
  return known && known[id] === true ? t('bag.pattern_known') : '';
}

/* TWO PRESSES: a pattern is a tradeable Rare and reading it can't be undone, so the first press only arms it (the line asks for a second)
   and a second press on the SAME pattern within ARM_MS learns it. Display state only: the server judges the learn. */
const ARM_MS = 10000;
/** True when this press is the second on pattern `id` within ARM_MS (the learn goes ahead); else arms it and answers false. */
export function armLearn(sc, id, now = Date.now()) {
  const a = sc.learnArm;
  if (a && a.id === id && now - a.at <= ARM_MS) { sc.learnArm = null; return true; }
  sc.learnArm = { id, at: now };
  return false;
}

/** Learn one pattern: ONE hr_recipe_learn through the window's `send` (its busy line, then the recipe's name on ok). */
export function learnPattern(account, cs, id, send) {
  const w = patternRowOf(id);
  return send(() => learnRecipe(account, cs, id), t('bag.pattern_busy'), () => t('bag.pattern_learned', { recipe: w ? w.row.name : '' }));
}
