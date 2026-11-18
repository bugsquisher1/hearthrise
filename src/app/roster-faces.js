// ════════════════════════════════════════════════════════════════════════
// src/app/roster-faces.js — EACH HERO'S OWN FIGURE ON "YOUR CHARACTERS".
//
// UI audit 2026-11-18 (#3): the characters screen listed names with no hero.
// Each row with a hero carries a canvas ([data-face="<slot>"]) and here it is
// drawn: the hero's own style-1 sprite and colors as the server's hr_load
// answer states them (AccountSession.roster rows' `look`, src/session/hero-look.js),
// the FIGURE of its idle frame facing the viewer (src/render/outfit-sprite.js),
// the World's own recolour. app.css sets it at 2 whole device px an art px. Until
// the art has loaded the canvas stays an empty well, never a stand-in.
// Display only: reads the roster it is given, sends nothing.
// ════════════════════════════════════════════════════════════════════════
import { outfitArt, outfitMasks, drawOutfit, FIGURE } from '../render/outfit-sprite.js?v=0.2.137';
import { dyesOf } from '../shell/windows/character/outfit.js?v=0.2.137';

/** Draw every [data-face] canvas under `root` from its roster row's look. Resolves once drawn (or once the art failed). */
export async function drawRosterFaces(root, roster) {
  const doc = root && root.ownerDocument;
  if (!doc) return;
  const looks = new Map((Array.isArray(roster) ? roster : []).filter((r) => r && r.exists && r.look).map((r) => [String(r.slot), r.look]));
  const canvases = Array.from(root.querySelectorAll('canvas[data-face]')).filter((c) => looks.has(c.getAttribute('data-face')));
  if (!canvases.length) return;
  /* the build's cache-buster is this module's own ?v= (bump-version.sh keeps every one equal) */
  const v = new URL(import.meta.url).searchParams.get('v') || '';
  const art = await outfitArt(doc, v).catch(() => null);
  if (!art) return;
  const masks = await outfitMasks(doc, v).catch(() => null);
  for (const c of canvases) {
    const look = looks.get(c.getAttribute('data-face'));
    if (drawOutfit(c, art, look.sprite, { dir: 's', scale: 1, dyes: dyesOf(look.base, doc), masks, crop: FIGURE })) c.setAttribute('data-drawn', look.sprite);
  }
}
