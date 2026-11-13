// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/fx-prefs.js — HOW STRONGLY EACH KIND OF EFFECT SHOWS IN THIS HUNT (the Effects sliders).
//
// PURE. The four sliders of src/data/fx-alpha.js, read as opacities 0..1 for the frame: each is a player
// switch holding a value (src/session/player-switch.js switchValue), the newest pick any open hero holds,
// else the row's initial value. The scene (scene.js) reads them every frame, so a slider dragged in
// Settings shows on the hunt at once, and after a reload they come back from the server's copy of the
// residue (the envelope's client_state). Display only: nothing gates or spends on them (CLAUDE.md §6).
//
//   fxAlphaOf(cs, peers)     { self, peer, monster, marks } as opacities
//   ownerOf(by, viewed, isHero)  whose effect a unit's is: 'self' | 'peer' | 'monster' | null
//   ownerAlpha(a, owner)     the opacity for an effect whose owner is 'self' | 'peer' | 'monster' | null
//                            (null: a reward, a Level or a rare drop, never dimmed)
// ════════════════════════════════════════════════════════════════════════
import { FX_ALPHA } from '../data/fx-alpha.js?v=0.2.127';
import { switchValue } from '../session/player-switch.js?v=0.2.127';

/**
 * @param {object} cs  the viewed CharacterSession
 * @param {() => object[]} [peers]  the account's open CharacterSessions (one pick for every hero)
 * @returns {{self: number, peer: number, monster: number, marks: number}}
 */
export function fxAlphaOf(cs, peers) {
  const all = typeof peers === 'function' ? peers() || [] : [];
  const heroes = !cs || all.includes(cs) ? all : all.concat(cs);
  const out = /** @type {any} */ ({});
  for (const r of FX_ALPHA) out[r.id] = switchValue(heroes, r) / 100;
  return out;
}

/** Whose effect it is, for the sliders: the unit `by` is the viewed hero ('self'), another hero ('peer') or a monster; an effect
    nobody owns (a reward, `by` undefined) is null. `isHero(unit)` is the scene's own test. */
export function ownerOf(by, viewed, isHero) {
  return by === undefined ? null : by === viewed ? 'self' : isHero(by) ? 'peer' : 'monster';
}

/** The opacity an effect owned by `owner` draws at (a: fxAlphaOf's answer). */
export function ownerAlpha(a, owner) {
  return owner && a && Number.isFinite(a[owner]) ? a[owner] : 1;
}
