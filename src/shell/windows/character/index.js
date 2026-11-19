// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/index.js — THE CHARACTER WINDOW (hotkey C).
//
// One window, four tabs, each its own module:
//   sheet.js    Character: portrait, role, level, vitals, the combat skills,
//               the engine's combat numbers, the bestiary, the XP bonuses
//   outfit.js   Outfit: the preview, the outfit grid, the dyes, Save (one intent)
//   deaths.js   Deaths: the server's death log
//   titles.js   Titles: what this hero has earned the right to be called
//   faction.js  Faction: the hero's side, standing, swap and the pieces standing buys (only while the server sends its section)
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
import { OUTFITS } from '../../../data/hunt-outfits.js?v=0.2.141';
import { lookColors } from '../../../data/outfits.js?v=0.2.141';
import { characterSheetOf, outfitOf } from '../../../session/character-sections.js?v=0.2.141';
import { heroSprite } from '../../../session/hero-look.js?v=0.2.141';
import { attr, cls, prop } from '../../../render/paint.js?v=0.2.141';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.141';
import { outfitArt, outfitMasks, drawOutfit, FIGURE } from '../../../render/outfit-sprite.js?v=0.2.141';
import { heroSetsFor, maskSetsFor } from '../../../data/world/atlas-sets.js?v=0.2.141';
import { scratchOf } from './state.js?v=0.2.141';
import { sheetHtml, patchSheet } from './sheet.js?v=0.2.141';
import { outfitHtml, patchOutfit, actOutfit, draftOf, dyesOf, colorsShown, facingOf, PREVIEW_SCALE } from './outfit.js?v=0.2.141';
import { deathsHtml, patchDeaths, actDeaths } from './deaths.js?v=0.2.141';
import { titlesHtml, patchTitles, actTitles } from './titles.js?v=0.2.141';
import { factionHtml, patchFaction, actFaction, factionShown, FACTION_TAB } from './faction.js?v=0.2.141';

const TABS = Object.freeze([['sheet', 'Character'], ['outfit', 'Outfit'], ['titles', 'Titles'], ['faction', FACTION_TAB], ['deaths', 'Deaths']]);
/* The portrait and the wardrobe draw the FIGURE at art size; character.css sets them 2 whole device px an art px (--art-px). */
const PORTRAIT_SCALE = 1;

/* The hero art and the color masks for every sprite this page's window has drawn (null until they land; the canvases stay blank, never
   a stand-in; MASKS null: the outfit draws as it is). A worn set's art (the faction looks) is asked for only once a canvas draws one of
   its sprites (src/data/world/atlas-sets.js heroSetsFor), so a hero who never sees a faction look fetches none of it. `gen` moves when
   either lands, so every canvas drawn before is drawn again with it. */
let ART = null, MASKS = null, gen = 0;
const wanted = new Set();
let artKey = null, maskKey = null;
function wantArt(doc, sprites) {
  if (!doc || !doc.baseURI) return;
  let more = artKey === null;
  for (const s of sprites || []) if (!wanted.has(s)) { wanted.add(s); more = true; }
  if (!more) return;
  /* The release's stamp is this module's own ?v= (one stamp on every module: tools/lib/version-stamp.mjs). */
  const v = new URL(import.meta.url).searchParams.get('v') || '';
  const list = [...wanted], key = heroSetsFor(list).join();
  if (key !== artKey) {
    artKey = key;
    outfitArt(doc, v, list).then((a) => { if (artKey === key) { ART = a; gen++; } }).catch(() => { if (artKey === key) artKey = null; });
  }
  /* asked once per set of sets: a failed fetch draws the outfit as it is and keeps the picker off, it doesn't ask again on every patch */
  if (key !== maskKey) { maskKey = key; outfitMasks(doc, v, list).then((m) => { if (maskKey === key) { MASKS = m; gen++; } }).catch(() => {}); }
}

/** The skeleton (built once per opening). */
export function renderCharacter(ctx) {
  /* a hero or mask set that failed to load is asked for again on the next opening (each loader asks only for what it does not hold) */
  if (ART && ART.sets.length < heroSetsFor([...wanted]).length) artKey = null;
  if (MASKS && MASKS.sets.length < maskSetsFor([...wanted]).length) maskKey = null;
  wantArt(ctx.doc);
  if (ctx.character) { const sc = scratchOf(ctx.character); sc.opening = 'due'; sc.sheetAsked = null; sc.price = null; sc.priceAskedAt = 0; }
  return '<div class="hw-cs">'
    + '<div class="hw-tabs" role="tablist">' + TABS.map(([id, l], i) => '<button type="button" role="tab" class="hw-tab" data-hs-act="cs-tab" data-tab="' + id + '" aria-selected="' + (i === 0) + '"' + (id === 'faction' ? ' hidden' : '') + '>' + esc(l) + '</button>').join('') + '</div>'
    + '<div class="hw-cs-pane" data-pane="sheet">' + sheetHtml() + '</div>'
    + '<div class="hw-cs-pane" data-pane="outfit">' + outfitHtml(ctx.glyphs) + '</div>'
    + '<div class="hw-cs-pane" data-pane="titles">' + titlesHtml() + '</div>'
    + '<div class="hw-cs-pane" data-pane="faction">' + factionHtml() + '</div>'
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

/* Draw `sprite` into a canvas once per (sprite, facing, dyes, art landed): the canvas keeps its signature. `doc` is the window's own
   document: a card just built is still in its template's inert one, whose base URL reaches no atlas. */
function paintCanvas(doc, canvas, sprite, dir, scale, dyes, crop) {
  if (!canvas) return;
  wantArt(doc, [sprite]);
  if (!ART) return;
  const sig = sprite + '|' + dir + '|' + scale + '|' + dyes.join(',') + '|' + gen + '|' + !!crop;
  if (canvas.getAttribute('data-sig') === sig) return;
  if (drawOutfit(canvas, ART, sprite, { dir, scale, dyes, masks: MASKS, crop })) attr(canvas, 'data-sig', sig);
}

renderCharacter.patch = function patchCharacter(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-cs');
  /* opened on a tab (an alert's "Open Titles", ../../widgets/alerts.js): the wish is taken once */
  const want = ctx.wm && typeof ctx.wm.takeTab === 'function' ? ctx.wm.takeTab('character') : null;
  if (want && TABS.some(([id]) => id === want)) { sc.tab = want; sc.msg = ''; }
  wantArt(ctx.doc);
  /* The Faction tab is the server's to offer (its switch): hidden, and left for the sheet if it was open, while the section is absent. */
  const fx = factionShown(cs);
  if (!fx && sc.tab === 'faction') sc.tab = 'sheet';
  prop(root.querySelector('.hw-tab[data-tab="faction"]'), 'hidden', !fx);
  for (const b of root.querySelectorAll('.hw-tab[data-tab]')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === sc.tab));
  for (const p of root.querySelectorAll('.hw-cs-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === sc.tab);
  askSheet(cs, sc);
  if (sc.tab === 'sheet') {
    const base = (outfitOf(cs) || {}).base || null;
    patchSheet(body, ctx, (canvas) => paintCanvas(ctx.doc, canvas, heroSprite(cs), 's', PORTRAIT_SCALE, dyesOf(lookColors(heroSprite(cs), base), ctx.doc), FIGURE), sc.opening === 'done');
  } else if (sc.tab === 'outfit') {
    const d = draftOf(cs, sc);
    /* every outfit in the grid and the big preview wear the colors being tried on: one set, across every outfit; a faction look at the creation
       defaults in its side's colors, as the World draws it (data/outfits.js lookColors) */
    const shown = colorsShown(cs, d);
    const dyesFor = (id) => dyesOf(lookColors(id, shown), ctx.doc);
    patchOutfit(body, ctx, sc, MASKS, (canvas, id) => paintCanvas(ctx.doc, canvas, OUTFITS[id], 's', 1, dyesFor(id), FIGURE), () => renderCharacter.patch(body, ctx));
    paintCanvas(ctx.doc, body.querySelector('.hw-of-preview'), OUTFITS[d.outfit], facingOf(sc), PREVIEW_SCALE, dyesFor(d.outfit));
  } else if (sc.tab === 'titles') patchTitles(body, ctx, sc);
  else if (sc.tab === 'faction') patchFaction(body, ctx, sc);
  else patchDeaths(body, ctx, sc);
};

renderCharacter.events = Object.freeze(['input']);

renderCharacter.act = function actCharacter(ctx, body, action, ev, t) {
  const sc = scratchOf(ctx.character);
  const repaint = () => renderCharacter.patch(body, ctx);
  if (action === 'cs-tab' && ev.type === 'click') { sc.tab = t.getAttribute('data-tab'); sc.msg = ''; sc.fxAsk = null; repaint(); return true; }
  if (sc.tab === 'outfit' && actOutfit(ctx, sc, action, ev, t, repaint)) return true;
  if (sc.tab === 'titles' && actTitles(ctx, sc, action, ev, t, repaint)) return true;
  if (sc.tab === 'faction' && actFaction(ctx, sc, action, ev, t, repaint)) return true;
  if (sc.tab === 'deaths' && actDeaths(sc, action, ev, t, repaint)) return true;
  return false;
};
