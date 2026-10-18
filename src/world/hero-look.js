// ════════════════════════════════════════════════════════════════════════
// src/world/hero-look.js — WHAT YOUR HERO WEARS IN THE WORLD.
//
// One look everywhere (Tyler 10-18): the town, the home and the cellar draw
// your hero with the SAME style-1 outfit sprite the live hunt draws it with
// (src/hunt-view/scene.js → outfitSprite). The outfit and role are the
// server's: your own party member's named outfit and role when a party
// section is held, else the role your worn weapon gives (the `role` item
// section), else the tank's outfit. There is no other hero sprite.
// PURE ESM: reads a CharacterSession's sections, never a global.
// ════════════════════════════════════════════════════════════════════════
import { outfitSprite } from '../data/hunt-outfits.js?v=0.1.0';
import { partyOf } from '../session/hunt-sections.js?v=0.1.0';
import { roleOf } from '../session/item-sections.js?v=0.1.0';

/** The sprite id of this character's hero: the hunt's outfit sprite, failing safe to the knight's. */
export function heroSprite(cs) {
  if (!cs) return outfitSprite(null, null);
  const p = partyOf(cs);
  const me = p && p.members.find((m) => m.unit === p.self);
  const worn = roleOf(cs);
  return outfitSprite(me && me.outfit, (me && me.role) || (worn && worn.id));
}
