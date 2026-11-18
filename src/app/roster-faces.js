// ════════════════════════════════════════════════════════════════════════
// src/app/roster-faces.js — EACH HERO'S OWN FIGURE ON "YOUR CHARACTERS".
//
// UI audit 2026-11-18 (#3): the characters screen listed names with no hero.
// Each row with a hero carries a canvas ([data-face="<slot>"]) and here it is
// drawn: the hero's own style-1 sprite as the server's hr_load answer states
// it (AccountSession.roster rows' `look`, src/session/hero-look.js), the FIGURE
// of its idle frame facing the viewer (src/render/outfit-sprite.js), as the
// town draws it (the `heroes` sheet, the town's own, and no color masks: the
// town loads none). app.css sets it at 2 whole device px an art px. Until the
// art has loaded the canvas stays an empty well, never a stand-in.
// THE TOWN PREWARM'S ORDER: the sheet's manifest first, then its image, and
// nothing for a list that is gone by then (a signed-out account asks for no
// sheet, tests/client-boot.mjs B-15). Display only: sends nothing.
// ════════════════════════════════════════════════════════════════════════
import { outfitArt, drawOutfit, FIGURE } from '../render/outfit-sprite.js?v=0.2.137';
import { loadAtlasManifest } from '../world/atlas.js?v=0.2.137';

/** Draw every [data-face] canvas under `root` from its roster row's look. Resolves once drawn (or once the art failed or the list went). */
export async function drawRosterFaces(root, roster) {
  const doc = root && root.ownerDocument;
  if (!doc) return;
  const looks = new Map((Array.isArray(roster) ? roster : []).filter((r) => r && r.exists && r.look).map((r) => [String(r.slot), r.look]));
  const canvases = Array.from(root.querySelectorAll('canvas[data-face]')).filter((c) => looks.has(c.getAttribute('data-face')));
  if (!canvases.length) return;
  /* the build's cache-buster is this module's own ?v= (bump-version.sh keeps every one equal) */
  const version = new URL(import.meta.url).searchParams.get('v') || '';
  const manifest = await loadAtlasManifest({ doc, version }, 'heroes').catch(() => null);
  if (!manifest || !root.isConnected) return;
  const art = await outfitArt(doc, version).catch(() => null);
  if (!art || !root.isConnected) return;
  for (const c of canvases) {
    const look = looks.get(c.getAttribute('data-face'));
    if (drawOutfit(c, art, look.sprite, { dir: 's', scale: 1, crop: FIGURE })) c.setAttribute('data-drawn', look.sprite);
  }
}
