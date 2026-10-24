// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/outfit.js — THE OUTFIT TAB: TRY ON, THEN SAVE.
//
// A large preview of the outfit being tried on (whole-number scale, a button
// that turns it through the eight facings), the outfit grid (search, "Show
// only owned"; premium outfits marked; one not owned can be previewed, never
// saved), the dye picker for the outfit's regions (shown only when its region
// masks are in the art set, src/render/outfit-sprite.js hasMask) and Save:
// ONE intent (hr_outfit_set) with the outfit and its dye indices. The server
// owns ownership and the worn look; the draft is display scratch until the
// re-read envelope says what is worn.
// ════════════════════════════════════════════════════════════════════════
import { OUTFIT_ROWS, OUTFIT_IDS, REGION_LABEL, DYE_COUNT } from '../../../data/outfits.js?v=0.2.43';
import { OUTFITS } from '../../../data/hunt-outfits.js?v=0.2.43';
import { FACINGS } from '../../../data/world/art-budget.js?v=0.2.43';
import { outfitOf } from '../../../session/character-sections.js?v=0.2.43';
import { heroSprite } from '../../../session/hero-look.js?v=0.2.43';
import { rows, text, cls, prop, attr, style, element } from '../../../render/paint.js?v=0.2.43';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.43';
import { glyphSvg } from '../../launcher.js?v=0.2.43';
import { hasMask } from '../../../render/outfit-sprite.js?v=0.2.43';
import { runIntent } from '../../intent-words.js?v=0.2.43';

/* The turn order of the rotate button: clockwise from facing the viewer. */
const TURN = Object.freeze(['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'].filter((d) => FACINGS.includes(d)));
export const PREVIEW_SCALE = 3;

/** The Outfit tab's skeleton. */
export function outfitHtml(g) {
  return '<section class="hw-cs-outfit">'
    + '<div class="hw-of-left"><div class="hw-of-stage"><canvas class="hw-of-preview" width="192" height="192" aria-label="Outfit preview"></canvas>'
    + '<button type="button" class="hh-tool hw-of-turn" data-hs-act="of-turn">Turn</button></div>'
    + '<p class="hw-of-name"></p>'
    + '<div class="hw-of-dye"><div class="hw-of-regions" role="tablist"></div><div class="hw-of-swatches"></div></div>'
    + '<div class="hw-of-save"><button type="button" class="hw-primary" data-hs-act="of-save">Save</button><p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>'
    + '<div class="hw-of-right"><div class="hw-of-tools"><label class="hw-search">' + glyphSvg(g, 'uiSearch')
    + '<input type="search" data-hs-act="of-search" placeholder="Search outfits" aria-label="Search outfits"></label>'
    + '<label class="hw-of-owned"><input type="checkbox" data-hs-act="of-owned"> Show only owned</label></div>'
    + '<p class="hs-note hw-of-looks">Looks only. How you fight comes from the weapon you hold.</p>'
    + '<ul class="hw-of-grid"></ul><p class="hh-empty hw-of-none">No outfit matches.</p></div>'
    + '</section>';
}

/** The draft, started from what the server says is worn (or the hero's current look). */
export function draftOf(cs, sc) {
  if (sc.draft) return sc.draft;
  const o = outfitOf(cs);
  const worn = o && o.worn;
  const shown = worn || Object.keys(OUTFITS).find((k) => OUTFITS[k] === heroSprite(cs)) || OUTFIT_IDS[0];
  return { outfit: shown, colors: worn ? Object.assign({}, o.colors) : {} };
}

const DYE_IDS = Array.from({ length: DYE_COUNT }, (_, i) => i);
/** The dyes of a draft as the renderer wants them: per region index, the dye token's colour or null. */
export function dyesOf(draft, doc) {
  const r = OUTFIT_ROWS[draft.outfit];
  const css = doc && doc.defaultView ? doc.defaultView.getComputedStyle(doc.documentElement) : null;
  const hex = (i) => (css && Number.isInteger(i) && i >= 0 && i < DYE_COUNT ? css.getPropertyValue('--dye-' + i).trim() || null : null);
  return r ? r.regions.map((g) => hex(draft.colors[g])) : [];
}

export const facingOf = (sc) => TURN[sc.dir % TURN.length];

/* Has the draft moved off the server's worn look? */
function changed(o, d) {
  if (!o) return false;
  if ((o.worn || null) !== d.outfit) return true;
  const a = o.colors, b = d.colors;
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  for (const k of keys) if (a[k] !== b[k]) return true;
  return false;
}

/** Patch the Outfit tab. `art` is the loaded hunt set or null; `drawTile(canvas, id)` draws a grid face. */
export function patchOutfit(body, ctx, sc, art, drawTile) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-cs-outfit');
  const o = outfitOf(cs);
  const d = draftOf(cs, sc);
  const row = OUTFIT_ROWS[d.outfit];
  const owned = !!o && o.owned.has(d.outfit);
  text(root.querySelector('.hw-of-name'), (row ? row.label : d.outfit) + (row && row.premium ? ' · Premium' : '') + (o && !owned ? ' · not owned' : ''));
  /* The dye picker: the outfit's regions, only when its masks are in the art set. */
  const dyeable = !!(row && row.regions.length && hasMask(art, OUTFITS[d.outfit]));
  cls(root.querySelector('.hw-of-dye'), 'is-on', dyeable);
  if (dyeable) {
    if (!row.regions.includes(sc.region)) sc.region = row.regions[0];
    rows(root.querySelector('.hw-of-regions'), row.regions, {
      key: (g) => d.outfit + ':' + g,
      build: (g) => element(ctx.doc, '<button type="button" role="tab" class="hw-tab" data-hs-act="of-region" data-region="' + esc(g) + '">' + esc(REGION_LABEL[g] || g) + '</button>'),
      patch: (b, g) => attr(b, 'aria-selected', String(g === sc.region)),
    });
    rows(root.querySelector('.hw-of-swatches'), DYE_IDS, {
      key: (i) => String(i),
      build: (i) => element(ctx.doc, '<button type="button" class="hw-of-swatch" data-hs-act="of-dye" data-dye="' + i + '" aria-label="Dye ' + (i + 1) + '"></button>'),
      patch: (b, i) => { style(b, 'background-color', 'var(--dye-' + i + ')'); attr(b, 'aria-pressed', String(d.colors[sc.region] === i)); },
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
  prop(root.querySelector('[data-hs-act="of-save"]'), 'disabled', sc.pending || !o || !owned || !changed(o, d));
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
    const o = outfitOf(cs);
    sc.draft = { outfit: id, colors: o && o.worn === id ? Object.assign({}, o.colors) : {} };
    sc.msg = '';
    repaint();
    return true;
  }
  if (action === 'of-region') { sc.region = t.getAttribute('data-region'); repaint(); return true; }
  if (action === 'of-dye' && sc.region) {
    const d = draftOf(cs, sc);
    const i = Number(t.getAttribute('data-dye'));
    sc.draft = { outfit: d.outfit, colors: Object.assign({}, d.colors, { [sc.region]: i }) };
    repaint();
    return true;
  }
  if (action === 'of-save') {
    const d = draftOf(cs, sc);
    runIntent(sc, repaint, () => cs.saveOutfit(d.outfit, d.colors), 'Saving…', () => { sc.draft = null; return 'Saved.'; });
    return true;
  }
  return false;
}
