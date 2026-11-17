// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/outfit-bundle.js — USING AN OUTFIT'S BUNDLE FROM THE BAG (the Key Warden, the Hearth Chest's super-rare:
// src/data/chests.js CHEST_OUTFITS; the server half is supabase/migrations/2027-04-30-sweeps-coat.sql hr_outfit_bundle_use).
//
// A bundle's primary press and its menu's "Use" are ONE intent (src/session/outfit-intents.js useOutfitBundle). Off, with why, only for
// what the screen already knows from the server's own outfit section: this hero owns the outfit already (the bundle is kept to sell).
// The outfit shows as owned only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../../data/items.js?v=0.2.137';
import { OUTFIT_ROWS } from '../../../data/outfits.js?v=0.2.137';
import { outfitOf } from '../../../session/character-sections.js?v=0.2.137';
import { useOutfitBundle } from '../../../session/outfit-intents.js?v=0.2.137';
import { t } from '../../../render/player-text.js?v=0.2.137';

/** The outfit item `id` is the bundle of, or null. Pure. */
export function bundleOutfitOf(id) {
  const it = Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
  return it && it.type === 'outfit_bundle' && typeof it.outfit === 'string' && Object.hasOwn(OUTFIT_ROWS, it.outfit) ? it.outfit : null;
}

/** Why Use is off for bundle `id` now ('' when the server is to judge): this hero owns its outfit already, by the server's section. */
export function bundleUseBlock(cs, id) {
  const outfit = bundleOutfitOf(id);
  const o = outfit ? outfitOf(cs) : null;
  return o && o.owned.has(outfit) ? t('bag.bundle_owned') : '';
}

/* TWO PRESSES: a bundle is a tradeable item worth a lot and its use can't be undone, so the first press only arms it (the line asks for a
   second) and a second press on the SAME bundle within ARM_MS uses it. Display state only: the server judges the use. */
const ARM_MS = 10000;
/** True when this press is the second on bundle `id` within ARM_MS (the use goes ahead); else arms it and answers false. */
export function armBundle(sc, id, now = Date.now()) {
  const a = sc.bundleArm;
  if (a && a.id === id && now - a.at <= ARM_MS) { sc.bundleArm = null; return true; }
  sc.bundleArm = { id, at: now };
  return false;
}

/** Use one bundle: ONE hr_outfit_bundle_use through the window's `send` (its busy line, then the outfit's name on ok). */
export function useBundle(account, cs, id, send) {
  const outfit = bundleOutfitOf(id);
  return send(() => useOutfitBundle(account, cs, id), t('bag.bundle_busy'),
    () => t('bag.bundle_used', { outfit: outfit ? OUTFIT_ROWS[outfit].label : '' }));
}
