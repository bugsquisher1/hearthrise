// ════════════════════════════════════════════════════════════════════════
// src/session/hero-look.js — WHAT YOUR HERO WEARS IN THE WORLD.
//
// One look everywhere (Tyler 10-18): the town, the home and the cellar draw
// your hero with the SAME style-1 outfit sprite the live hunt draws it with
// (src/hunt-view/scene.js → outfitSprite). The outfit and role are the
// server's: the outfit you chose in the Character window (the `outfit`
// section, owned server-side), else your own party member's named outfit and
// role when a party section is held, else the role your worn weapon gives
// (the `role` item section), else the tank's outfit. There is no other hero sprite.
// PURE ESM: reads a CharacterSession's sections, never a global.
// ════════════════════════════════════════════════════════════════════════
import { outfitSprite } from '../data/hunt-outfits.js?v=0.2.3';
import { partyOf } from './hunt-sections.js?v=0.2.3';
import { roleOf } from './item-sections.js?v=0.2.3';
import { outfitOf } from './character-sections.js?v=0.2.3';

/** The sprite id of this character's hero: the hunt's outfit sprite, failing safe to the knight's. */
export function heroSprite(cs) {
  if (!cs) return outfitSprite(null, null);
  const p = partyOf(cs);
  const me = p && p.members.find((m) => m.unit === p.self);
  const worn = roleOf(cs);
  const chosen = outfitOf(cs);
  return outfitSprite((chosen && chosen.worn) || (me && me.outfit), (me && me.role) || (worn && worn.id));
}
