// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/outfit.js — THE OUTFIT TAB: TRY ON, THEN SAVE.
//
// A large preview of the outfit being tried on (whole-number scale, a button
// that turns it through the eight facings), the outfit grid (search, "Show
// only owned"; premium outfits marked; one not owned can be previewed, never
// worn), and the dye picker. Two separate saves, because they are two things:
//   Wear this outfit   ONE free intent (hr_outfit_set): the server owns ownership.
//   Save colors: N gp  ONE paid intent (hr_hero_colors_set) with four dye indices and
//                      the server's quote. A hero's colors are one set, across every outfit.
// TRYING ON IS FREE AND TELLS THE TRUTH: the preview is the World's own recolour, the
// picker offers only the parts this outfit's art can show, by their names ("Plume",
// "Waist cloth"), and the druid's picker says why it has none. Everything here is display
// scratch until the re-read envelope says what is worn and what the colors are. A price the purse can't pay leaves Save colors off with
// the line under it saying how much more (the house style; v0.2.97 gate: 1,550 gp live on a 400 gp purse, refused only after the press).
// ════════════════════════════════════════════════════════════════════════
import { OUTFIT_ROWS, OUTFIT_IDS, BASE_REGIONS, BASE_DEFAULT_COLORS, DYE_COUNT, dyeKeyOf } from '../../../data/outfits.js?v=0.2.115';
import { OUTFITS } from '../../../data/hunt-outfits.js?v=0.2.115';
import { FACINGS } from '../../../data/world/art-budget.js?v=0.2.115';
import { outfitOf } from '../../../session/character-sections.js?v=0.2.115';
import { goldOf } from '../../../session/item-sections.js?v=0.2.115';
import { heroSprite } from '../../../session/hero-look.js?v=0.2.115';
import { saveHeroColors, readColorsPrice } from '../../../session/hero-color-intents.js?v=0.2.115';
import { rows, text, cls, prop, attr, style, element } from '../../../render/paint.js?v=0.2.115';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.115';
import { gold } from '../../../render/format.js?v=0.2.115';
import { glyphSvg } from '../../launcher.js?v=0.2.115';
import { runIntent, refusalText } from '../../intent-words.js?v=0.2.115';

/* The turn order of the rotate button: clockwise from facing the viewer. */
const TURN = Object.freeze(['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'].filter((d) => FACINGS.includes(d)));
export const PREVIEW_SCALE = 3;

/** The Outfit tab's skeleton. */
export function outfitHtml(g) {
  return '<section class="hw-cs-outfit">'
    + '<div class="hw-of-left"><div class="hw-of-stage"><canvas class="hw-of-preview" width="192" height="192" aria-label="Outfit preview"></canvas>'
    + '<button type="button" class="hh-tool hw-of-turn" data-hs-act="of-turn">Turn</button></div>'
    + '<p class="hw-of-name"></p>'
    + '<p class="hw-of-shows"></p>'
    + '<div class="hw-of-dye"><div class="hw-of-regions" role="tablist"></div><div class="hw-of-swatches"></div></div>'
    + '<div class="hw-of-save"><button type="button" class="hh-tool" data-hs-act="of-save">Wear this outfit</button>'
    + '<button type="button" class="hw-primary hw-of-colors" data-hs-act="of-colors"></button>'
    + '<button type="button" class="hh-tool hw-of-undo" data-hs-act="of-undo">Undo colors</button>'
    + '<p class="hw-why hw-of-why"></p>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>'
    + '<div class="hw-of-right"><div class="hw-of-tools"><label class="hw-search">' + glyphSvg(g, 'uiSearch')
    + '<input type="search" data-hs-act="of-search" placeholder="Search outfits" aria-label="Search outfits"></label>'
    + '<label class="hw-of-owned"><input type="checkbox" data-hs-act="of-owned"> Show only owned</label></div>'
    + '<p class="hs-note hw-of-looks">Looks only. How you fight comes from the weapon you hold.</p>'
    + '<ul class="hw-of-grid"></ul><p class="hh-empty hw-of-none">No outfit matches.</p></div>'
    + '</section>';
}

/** The draft: the outfit being tried on, and colors only once a swatch was pressed (null: the server's). */
export function draftOf(cs, sc) {
  if (sc.draft) return sc.draft;
  const o = outfitOf(cs);
  const worn = o && o.worn;
  const shown = worn || Object.keys(OUTFITS).find((k) => OUTFITS[k] === heroSprite(cs)) || OUTFIT_IDS[0];
  return { outfit: shown, colors: null };
}

/** The colors the try-on shows: the draft's, else what the server holds, else null (a hero with none draws as the art is). */
export const colorsShown = (cs, d) => { const o = outfitOf(cs); return d.colors || (o && o.base) || null; };

const DYE_IDS = Array.from({ length: DYE_COUNT }, (_, i) => i);
/** Four colors as the renderer wants them: per BASE_REGIONS index, the dye token's colour or null. */
export function dyesOf(colors, doc) {
  const css = doc && doc.defaultView ? doc.defaultView.getComputedStyle(doc.documentElement) : null;
  const hex = (i) => (css && Number.isInteger(i) && i >= 0 && i < DYE_COUNT ? css.getPropertyValue('--dye-' + i).trim() || null : null);
  return colors ? BASE_REGIONS.map((g) => hex(colors[g])) : [];
}

export const facingOf = (sc) => TURN[sc.dir % TURN.length];

/** What the try-on says it changes, for an outfit row. Pure. */
export function showsWords(row, hiddenChange) {
  if (!row) return '';
  if (!row.regions.length) return row.plain;
  const parts = row.regions.map((g) => row.parts[g]).join(', ');
  return 'On this outfit your colors change: ' + parts + '. The rest stays as drawn.'
    + (hiddenChange ? ' This save only changes colors this outfit doesn\'t show. They show on your other outfits.' : '');
}

/* Has the draft moved a region this outfit's art doesn't show, and no region it does? */
function onlyHidden(row, base, colors) {
  if (!row || !base || !colors) return false;
  const moved = BASE_REGIONS.filter((g) => base[g] !== colors[g]);
  return moved.length > 0 && !moved.some((g) => row.regions.includes(g));
}

/* The tab's one read: what a save costs. Once per opening of the tab and after each answer that moved it; a read that failed is tried again on a later patch, never in a loop. */
const PRICE_RETRY_MS = 5000;
function askPrice(ctx, sc, repaint) {
  const now = Date.now();
  if (sc.price !== null || sc.priceAsking || now - sc.priceAskedAt < PRICE_RETRY_MS) return;
  sc.priceAsking = true;
  sc.priceAskedAt = now;
  readColorsPrice(ctx.account, ctx.character).catch(() => ({ ok: false })).then((r) => {
    sc.priceAsking = false;
    if (r.ok) { sc.price = r.price; sc.priceAskedAt = 0; }
    else if (!sc.pending) sc.msg = refusalText(r, ctx.character);
    repaint();
  });
}

/** Patch the Outfit tab. `masks` is the loaded mask set or null; `drawTile(canvas, id)` draws a grid face; `repaint` patches again. */
export function patchOutfit(body, ctx, sc, masks, drawTile, repaint) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-cs-outfit');
  const o = outfitOf(cs);
  const d = draftOf(cs, sc);
  const row = OUTFIT_ROWS[d.outfit];
  const owned = !!o && o.owned.has(d.outfit);
  text(root.querySelector('.hw-of-name'), (row ? row.label : d.outfit) + (row && row.premium ? ' · Premium' : '') + (o && !owned ? ' · not owned' : ''));
  const shown = colorsShown(cs, d);
  const changedColors = !!d.colors && !!o && dyeKeyOf(d.colors) !== dyeKeyOf(o.base);
  /* The picker: this outfit's parts, by their names, once the masks are here. The druid's row says why it has none. */
  const dyeable = !!(row && row.regions.length && masks);
  cls(root.querySelector('.hw-of-dye'), 'is-on', dyeable);
  text(root.querySelector('.hw-of-shows'), showsWords(row, changedColors && onlyHidden(row, o && o.base, d.colors)));
  if (dyeable) {
    if (!row.regions.includes(sc.region)) sc.region = row.regions[0];
    rows(root.querySelector('.hw-of-regions'), row.regions, {
      key: (g) => d.outfit + ':' + g,
      build: (g) => element(ctx.doc, '<button type="button" role="tab" class="hw-tab" data-hs-act="of-region" data-region="' + esc(g) + '">' + esc(row.parts[g]) + '</button>'),
      patch: (b, g) => attr(b, 'aria-selected', String(g === sc.region)),
    });
    rows(root.querySelector('.hw-of-swatches'), DYE_IDS, {
      key: (i) => String(i),
      build: (i) => element(ctx.doc, '<button type="button" class="hw-of-swatch" data-hs-act="of-dye" data-dye="' + i + '" aria-label="Color ' + (i + 1) + '"></button>'),
      patch: (b, i) => { style(b, 'background-color', 'var(--dye-' + i + ')'); attr(b, 'aria-pressed', String(!!shown && shown[sc.region] === i)); },
    });
  }
  /* The grid: search and the owned filter; premium and not-owned marked. */
  const q = sc.query.trim().toLowerCase();
  const ids = OUTFIT_IDS.filter((id) => (!q || OUTFIT_ROWS[id].label.toLowerCase().includes(q)) && (!sc.ownedOnly || (o && o.owned.has(id))));
  rows(root.querySelector('.hw-of-grid'), ids, {
    key: (id) => id,
    build: (id) => element(ctx.doc, '<li><button type="button" class="hw-of-card" data-hs-act="of-pick" data-outfit="' + esc(id) + '">'
      + '<canvas class="hw-of-face" width="64" height="64" aria-hidden="true"></canvas><b>' + esc(OUTFIT_ROWS[id].label) + '</b><small class="hw-of-mark"></small></button></li>'),
    patch: (li, id) => {
      const b = li.firstChild;
      attr(b, 'aria-pressed', String(id === d.outfit));
      cls(b, 'is-worn', !!o && o.worn === id);
      const have = !!o && o.owned.has(id);
      cls(b, 'is-locked', !!o && !have);
      text(b.querySelector('.hw-of-mark'), o && o.worn === id ? 'Worn' : OUTFIT_ROWS[id].premium ? (have ? 'Premium' : 'Premium · not owned') : '');
      drawTile(b.querySelector('canvas'), id);
    },
  });
  cls(root.querySelector('.hw-of-none'), 'is-on', !ids.length);
  prop(root.querySelector('[data-hs-act="of-owned"]'), 'checked', sc.ownedOnly);
  prop(root.querySelector('[data-hs-act="of-save"]'), 'disabled', sc.pending || !o || !owned || (o.worn || null) === d.outfit);
  /* Save colors shows only when there is something to pay for, on an outfit that can show it, with the server's own number on it. The number is this
     window's read, never the envelope's: a settle prices nothing (tests/settle-budget.mjs), and a stale one only earns quote_changed, which re-reads it. */
  askPrice(ctx, sc, repaint);
  const offer = changedColors && !!row && row.regions.length > 0;
  const save = root.querySelector('[data-hs-act="of-colors"]');
  cls(save, 'is-on', offer);
  text(save, !offer ? '' : sc.price !== null ? 'Save colors: ' + gold(sc.price) : 'Asking the price…');
  /* the envelope's purse against the server's quote: short, the button stays off and says by how much */
  const purse = goldOf(cs);
  const short = offer && sc.price !== null && Number.isSafeInteger(purse) && purse < sc.price ? sc.price - purse : 0;
  prop(save, 'disabled', sc.pending || !offer || sc.price === null || short > 0);
  attr(save, 'data-off-why', short ? 'You need ' + gold(short) + ' more.' : null);
  text(root.querySelector('.hw-of-why'), short ? 'You need ' + gold(short) + ' more.' : '');
  cls(root.querySelector('.hw-of-undo'), 'is-on', changedColors);
  prop(root.querySelector('.hw-of-undo'), 'disabled', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
}

/** One gesture on the Outfit tab; true when it was the tab's. */
export function actOutfit(ctx, sc, action, ev, t, repaint) {
  const cs = ctx.character;
  if (action === 'of-search' && ev.type === 'input') { sc.query = String(t.value || '').slice(0, 40); repaint(); return true; }
  if (action === 'of-owned' && ev.type === 'change') { sc.ownedOnly = !!t.checked; repaint(); return true; }
  if (ev.type !== 'click') return false;
  if (action === 'of-turn') { sc.dir = (sc.dir + 1) % TURN.length; repaint(); return true; }
  if (action === 'of-pick') {
    const id = t.getAttribute('data-outfit');
    if (!OUTFIT_ROWS[id]) return true;
    /* the colors stay: they are one set, across every outfit */
    sc.draft = { outfit: id, colors: draftOf(cs, sc).colors };
    sc.msg = '';
    repaint();
    return true;
  }
  if (action === 'of-region') { sc.region = t.getAttribute('data-region'); repaint(); return true; }
  if (action === 'of-dye' && sc.region) {
    const d = draftOf(cs, sc);
    const i = Number(t.getAttribute('data-dye'));
    sc.draft = { outfit: d.outfit, colors: Object.assign({}, colorsShown(cs, d) || BASE_DEFAULT_COLORS, { [sc.region]: i }) };
    sc.msg = '';
    repaint();
    return true;
  }
  if (action === 'of-undo') { const d = draftOf(cs, sc); sc.draft = { outfit: d.outfit, colors: null }; sc.msg = ''; repaint(); return true; }
  if (action === 'of-save') {
    const d = draftOf(cs, sc);
    runIntent(sc, repaint, () => cs.saveOutfit(d.outfit), 'Saving…', () => { sc.draft = d.colors ? { outfit: d.outfit, colors: d.colors } : null; return 'Saved.'; }, cs);
    return true;
  }
  if (action === 'of-colors') {
    const d = draftOf(cs, sc);
    if (!d.colors || sc.price === null) return true;
    const price = sc.price;
    /* every answer re-reads the price: a Level may have moved it, and a refusal may be the reason */
    runIntent(sc, repaint, () => saveHeroColors(ctx.account, cs, d.colors, price).then((r) => { sc.price = null; sc.priceAskedAt = 0; return r; }), 'Saving…',
      () => { sc.draft = { outfit: d.outfit, colors: null }; return 'Saved. Everyone sees your new colors.'; }, cs);
    return true;
  }
  return false;
}
