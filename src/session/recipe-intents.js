// ════════════════════════════════════════════════════════════════════════
// src/session/recipe-intents.js — LEARNING A PATTERN (supabase/migrations/2026-09-14-recipe-learn.sql hr_recipe_learn; src/data/patterns.js).
//
// ONE intent naming only this character's slot, the pattern's item id and a fresh key. Never a recipe, a hero or a count: the server
// checks the id against its own catalogue (hr_unlocks' recipe:<id>, hr_items), refuses a pattern this hero knows already BEFORE it takes
// one (already_learned), takes one from THIS hero's bag under its lock, writes the hero's learned flag and journals it. The learned set is
// per hero: another hero of the account meets a closed bench until it reads its own. On ok the character is RE-READ, so the bench opens
// only from the envelope's `unlocked_recipes` (bench-sections.js learnedRecipesOf); a refusal the server answered re-reads it once too
// (quoted-ask.js afterRefusal, A20).
//   learnRecipe(account, cs, item)   hr_recipe_learn   ok: { ok, item }; refuses already_learned, insufficient_item, unknown_recipe,
//                                                      recipe_daily_cap, rate_limited
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.141';
import { afterRefusal } from './quoted-ask.js?v=0.2.141';
import { refusalOf } from './refusal.js?v=0.2.141';

const WORD = /^[a-z0-9_]{1,64}$/;

/** Learn the pattern `item` for this hero: one is taken from its bag. Resolves to { ok, item } or the refusal. */
export function learnRecipe(account, cs, item) {
  if (!account || !account.server || typeof account.server.rpc !== 'function' || !cs || !Number.isInteger(cs.slot) || !WORD.test(String(item))) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'recipe_learn' });
  }
  return askVia(cs, 'recipe_learn', async () => {
    const ans = await account.server.rpc('hr_recipe_learn', { p_item: item, p_slot: cs.slot, p_idem: globalThis.crypto.randomUUID() });
    const b = ans && ans.body && typeof ans.body === 'object' ? ans.body : {};
    if (ans && ans.ok && b.ok === true) {
      if (cs.status !== 'closed' && typeof cs.load === 'function') await cs.load();
      return { ok: true, item };
    }
    const r = Object.assign(refusalOf(ans), { verb: 'recipe_learn' });
    await afterRefusal(cs, ans);   // the screen was behind the server: re-read once (A20)
    return r;
  });
}
