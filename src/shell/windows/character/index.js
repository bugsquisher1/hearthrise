// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/index.js — THE CHARACTER WINDOW (hotkey C).
//
// One window, four tabs, each its own module:
//   sheet.js    Character: portrait, role, level, vitals, the combat skills,
//               the engine's combat numbers, the bestiary, the XP bonuses
//   outfit.js   Outfit: the preview, the outfit grid, the dyes, Save (one intent)
//   deaths.js   Deaths: the server's death log
//   titles.js   Titles: what this hero has earned the right to be called
//   state.js    the window's display scratch
// Built once per opening, patched in place on every envelope and display tick
// (src/render/paint.js).
//
// THE SHEET ASK. The combat numbers are the engine's (the `character_sheet`
// section, fresh only while its inputs AND its engine are current). Each
// opening asks the engine ONCE (the `sheet` verb), so the numbers on screen
// are always the deployed engine's: they show only after that ask has
// answered, and the first opening after a deploy retires every older sheet.
// While open, a stale sheet is asked for once per record version. The answer
// is the re-read envelope. A server without the section is never asked.
// ════════════════════════════════════════════════════════════════════════
import { OUTFITS } from '../../../data/hunt-outfits.js?v=0.2.120';
import { characterSheetOf, outfitOf } from '../../../session/character-sections.js?v=0.2.120';
import { heroSprite } from '../../../session/hero-look.js?v=0.2.120';
import { attr, cls } from '../../../render/paint.js?v=0.2.120';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.120';
import { outfitArt, outfitMasks, drawOutfit } from '../../../render/outfit-sprite.js?v=0.2.120';
import { scratchOf } from './state.js?v=0.2.120';
import { sheetHtml, patchSheet } from './sheet.js?v=0.2.120';
import { outfitHtml, patchOutfit, actOutfit, draftOf, dyesOf, colorsShown, facingOf, PREVIEW_SCALE } from './outfit.js?v=0.2.120';
import { deathsHtml, patchDeaths, actDeaths } from './deaths.js?v=0.2.120';
import { titlesHtml, patchTitles, actTitles } from './titles.js?v=0.2.120';

const TABS = Object.freeze([['sheet', 'Character'], ['outfit', 'Outfit'], ['titles', 'Titles'], ['deaths', 'Deaths']]);
const PORTRAIT_SCALE = 1;

/* The hunt art set, once loaded (null until then; the canvases stay blank, never a stand-in), and the color masks (null: the outfit draws as it is). */
let ART = null, MASKS = null, masksAsked = false;
function wantArt(doc) {
  if ((ART && masksAsked) || !doc || !doc.baseURI) return;
  /* The build's cache-buster is this module's own ?v= (bump-version.sh keeps every one equal). */
  const v = new URL(import.meta.url).searchParams.get('v') || '';
  if (!ART) outfitArt(doc, v).then((a) => { ART = a; }).catch(() => { /* the canvases stay blank */ });
  /* asked once a page: a failed fetch draws the outfit as it is and keeps the picker off, it doesn't ask again on every patch */
  if (!masksAsked) { masksAsked = true; outfitMasks(doc, v).then((m) => { MASKS = m; }).catch(() => {}); }
}

/** The skeleton (built once per opening). */
export function renderCharacter(ctx) {
  wantArt(ctx.doc);
  if (ctx.character) { const sc = scratchOf(ctx.character); sc.opening = 'due'; sc.sheetAsked = null; sc.price = null; sc.priceAskedAt = 0; }
  return '<div class="hw-cs">'
    + '<div class="hw-tabs" role="tablist">' + TABS.map(([id, l], i) => '<button type="button" role="tab" class="hw-tab" data-hs-act="cs-tab" data-tab="' + id + '" aria-selected="' + (i === 0) + '">' + esc(l) + '</button>').join('') + '</div>'
    + '<div class="hw-cs-pane" data-pane="sheet">' + sheetHtml() + '</div>'
    + '<div class="hw-cs-pane" data-pane="outfit">' + outfitHtml(ctx.glyphs) + '</div>'
    + '<div class="hw-cs-pane" data-pane="titles">' + titlesHtml() + '</div>'
    + '<div class="hw-cs-pane" data-pane="deaths">' + deathsHtml() + '</div>'
    + '</div>';
}

/* One ask per opening, then one per record version while the server says the sheet is stale. */
function askSheet(cs, sc) {
  const sh = characterSheetOf(cs);
  const v = cs.record ? cs.record.version : null;
  if (!sh || sc.sheetAsking || v === null) return;
  if (sc.opening !== 'due' && (sh.fresh || sc.sheetAsked === v)) return;
  sc.sheetAsked = v;
  sc.sheetAsking = true;
  if (sc.opening === 'due') sc.opening = 'asking';
  Promise.resolve(cs.edgeIntent('sheet', {})).catch(() => null).then(() => { sc.sheetAsking = false; sc.opening = 'done'; });
}

/* Draw `sprite` into a canvas once per (sprite, facing, dyes): the canvas keeps its signature. */
function paintCanvas(canvas, sprite, dir, scale, dyes) {
  if (!ART || !canvas) return;
  const sig = sprite + '|' + dir + '|' + scale + '|' + dyes.join(',') + '|' + !!MASKS;
  if (canvas.getAttribute('data-sig') === sig) return;
  if (drawOutfit(canvas, ART, sprite, { dir, scale, dyes, masks: MASKS })) attr(canvas, 'data-sig', sig);
}

renderCharacter.patch = function patchCharacter(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-cs');
  wantArt(ctx.doc);
  for (const b of root.querySelectorAll('.hw-tab[data-tab]')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === sc.tab));
  for (const p of root.querySelectorAll('.hw-cs-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === sc.tab);
  askSheet(cs, sc);
  if (sc.tab === 'sheet') {
    const base = (outfitOf(cs) || {}).base || null;
    patchSheet(body, ctx, (canvas) => paintCanvas(canvas, heroSprite(cs), 's', PORTRAIT_SCALE, dyesOf(base, ctx.doc)), sc.opening === 'done');
  } else if (sc.tab === 'outfit') {
    const d = draftOf(cs, sc);
    /* every outfit in the grid and the big preview wear the colors being tried on: one set, across every outfit */
    const dyes = dyesOf(colorsShown(cs, d), ctx.doc);
    patchOutfit(body, ctx, sc, MASKS, (canvas, id) => paintCanvas(canvas, OUTFITS[id], 's', 1, dyes), () => renderCharacter.patch(body, ctx));
    paintCanvas(body.querySelector('.hw-of-preview'), OUTFITS[d.outfit], facingOf(sc), PREVIEW_SCALE, dyes);
  } else if (sc.tab === 'titles') patchTitles(body, ctx, sc);
  else patchDeaths(body, ctx, sc);
};

renderCharacter.events = Object.freeze(['input']);

renderCharacter.act = function actCharacter(ctx, body, action, ev, t) {
  const sc = scratchOf(ctx.character);
  const repaint = () => renderCharacter.patch(body, ctx);
  if (action === 'cs-tab' && ev.type === 'click') { sc.tab = t.getAttribute('data-tab'); sc.msg = ''; repaint(); return true; }
  if (sc.tab === 'outfit' && actOutfit(ctx, sc, action, ev, t, repaint)) return true;
  if (sc.tab === 'titles' && actTitles(ctx, sc, action, ev, t, repaint)) return true;
  if (sc.tab === 'deaths' && actDeaths(sc, action, ev, t, repaint)) return true;
  return false;
};
