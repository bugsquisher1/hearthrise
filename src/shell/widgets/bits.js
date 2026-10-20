// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/bits.js — THE SMALL PARTS EVERY HUNT PANEL SHARES.
//
// A gauge (built once, patched by width and text), an item icon (the pixel set,
// derived from the id; a glyph when the id is not an item), an item's name, and
// the frame every hunt panel sits in (title, minimise). Display only.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../data/items.js?v=0.2.18';
import { DRINK_ITEMS } from '../../data/drinks.js?v=0.2.18';
import { MONSTERS } from '../../data/monsters.js?v=0.2.18';
import { ABILITIES } from '../../data/abilities.js?v=0.2.18';
import { PIXEL_DIR, ABILITY_DIR, ABILITY_ART } from '../../data/item-art.js?v=0.2.18';
import { ROLE_GLYPH } from '../../data/hunt-hud.js?v=0.2.18';
import { glyphSvg } from '../launcher.js?v=0.2.18';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.18';
import { text, style, attr } from '../../render/paint.js?v=0.2.18';

/** A gauge's skeleton: kind is hp | mana | stamina | xp. */
export function gaugeHtml(kind, label) {
  return '<span class="hh-gauge is-' + kind + '" role="meter" aria-label="' + esc(label) + '" aria-valuemin="0">'
    + '<i class="hh-gauge-fill"></i><em class="hh-gauge-text"></em></span>';
}

/** Patch a gauge to cur/max with its readout; an unknown value empties it and reads a dash. */
export function patchGauge(el, cur, max, readout) {
  if (!el) return;
  const known = Number.isFinite(cur) && Number.isFinite(max) && max > 0;
  const f = known ? Math.max(0, Math.min(1, cur / max)) : 0;
  style(el.firstElementChild, 'width', (Math.round(f * 1000) / 10) + '%');
  text(el.lastElementChild, readout);
  attr(el, 'aria-valuenow', known ? Math.round(cur) : null);
  attr(el, 'aria-valuemax', known ? Math.round(max) : null);
}

const spelled = (id) => { const t = String(id).replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

/** An item's player-facing name (the catalogue's), or the id spelled out. */
export function itemName(id) {
  const it = ITEMS[id] || DRINK_ITEMS[id];
  return it && it.n ? it.n : spelled(id);
}


/** A monster's name from the bestiary rows. */
export function monsterName(id) { return (MONSTERS[id] && MONSTERS[id].name) || spelled(id); }

/** An ability's name ('basic' is the weapon's basic attack). */
export function abilityName(id) { return id === 'basic' ? 'Basic attack' : (ABILITIES[id] && ABILITIES[id].n) || spelled(id); }

/** An element or damage type, as a word. */
export function elementName(id) { return spelled(id); }

/** An item's 32 px pixel icon at x2, or the glyph `fallback` when the id is not an item. */
export function itemIconHtml(glyphs, id, fallback) {
  if (ITEMS[id]) return '<img class="hh-icon" src="' + esc(PIXEL_DIR + id + '.png') + '" alt="" width="32" height="32" decoding="async">';
  return '<span class="hh-icon is-glyph">' + glyphSvg(glyphs, fallback || (DRINK_ITEMS[id] ? 'uiPotion' : 'uiChest')) + '</span>';
}

/* A glyph for an ability with no pixel tile yet, and for the slot kinds that name no one item. */
const ACTION_GLYPH = Object.freeze({ cleave: 'uiAxe', rend: 'uiBone', food: 'uiFood', drink: 'uiPotion', loaded: 'uiArrow' });

/** A bar action's 32 px icon: the ability's pixel tile, the item's pixel icon, else a glyph. */
export function actionIconHtml(glyphs, action) {
  const id = action && action.id;
  if (action && action.type === 'ability' && ABILITY_ART.includes(id)) {
    return '<img class="hh-icon" src="' + esc(ABILITY_DIR + id + '.png') + '" alt="" width="32" height="32" decoding="async">';
  }
  if (ITEMS[id]) return itemIconHtml(glyphs, id);
  return '<span class="hh-icon is-glyph">' + glyphSvg(glyphs, ACTION_GLYPH[id] || (action && action.type === 'ability' ? 'uiSpark' : 'uiChest')) + '</span>';
}

/** The frame every hunt panel sits in: a title row (with optional controls) and a body. */
export function panelHtml(cls, title, controls, body) {
  return '<section class="hh-panel ' + cls + '" aria-label="' + esc(title) + '">'
    + '<header class="hh-panel-head"><h2 class="hh-panel-title">' + esc(title) + '</h2>' + (controls || '') + '</header>'
    + '<div class="hh-panel-body">' + body + '</div></section>';
}

/** A role glyph box: its icon rewritten only when the role changes (the role comes from the weapon). */
export function patchRoleGlyph(el, role, glyphs) {
  if (!el || el.getAttribute('data-role') === String(role)) return;
  el.innerHTML = glyphSvg(glyphs, ROLE_GLYPH[role] || 'uiPeople');
  el.setAttribute('data-role', String(role));
}
