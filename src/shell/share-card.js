// ════════════════════════════════════════════════════════════════════════
// src/shell/share-card.js — THE RARE FIND'S CARD: A PNG THE PLAYER TAKES OUT
// OF THE GAME (Tyler's "super-rare drop moments": a shareable card).
//
// The owner's rare-drop alert (src/shell/alerts.js) carries its Share button;
// the card shows the item's pixel icon at an integer scale (a Rare or Signature
// in its standout frame, src/shell/item-standing.js), its name in that frame's
// colour, the hero, the hunt and the date. Display only: every fact is the
// alert's (the server's rare_drop event and the character's record), and
// nothing on the card is ever read back by the game or sent to the server.
//   cardFacts(alert)        the card's facts, or null (not a rare alert)
//   cardLayout(facts)       the card as drawing steps (pure; colours are TOKEN
//                           names, so the card is Charcoal & Gold by construction)
//   drawCard(doc, facts)    the steps on a canvas, colours read from the page's
//                           tokens (src/styles/tokens.css), the icon never smoothed
//   shareCard(doc, facts)   copy the PNG to the clipboard, else the share sheet,
//                           else a download: { ok, how: copied | shared | saved }
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js';
import { PIXEL_DIR, fileFor } from '../data/item-art.js';
import { standingOf } from './item-standing.js';
import { itemName } from './widgets/bits.js';

/* The card in CSS pixels, the integer it is exported at, and the icon's integer scale (32 px art). */
export const CARD = Object.freeze({ w: 420, h: 200, px: 2, icon: 32, iconScale: 4 });
/* The standout frames (tools/make-ui-steel-art.mjs) and the name's ink, by a piece's step. */
const STD_FRAMES = Object.freeze({
  rare: { src: 'assets/ui/std-frame-rare.png', slice: 3, ink: '--rar-rare' },
  very_rare: { src: 'assets/ui/std-frame-rare.png', slice: 3, ink: '--rar-rare' },
  signature: { src: 'assets/ui/std-frame-signature.png', slice: 4, ink: '--rar-unique' },
});
const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

/** A find's date as the player's calendar reads it: '22 Oct 2026' (null when unknown). */
export function cardDate(ms) {
  const d = new Date(ms);
  return Number.isFinite(ms) && !Number.isNaN(d.getTime()) ? d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() : null;
}

/** The card's facts from a rare-drop alert, or null. */
export function cardFacts(a) {
  if (!a || a.kind !== 'rare' || typeof a.item !== 'string' || !a.item) return null;
  return { item: a.item, name: itemName(a.item), standing: standingOf(a.item), hero: typeof a.hero === 'string' ? a.hero : null,
    place: typeof a.place === 'string' ? a.place : null, date: cardDate(a.at),
    icon: ITEMS[a.item] ? PIXEL_DIR + fileFor(a.item) : null };
}

/**
 * The card as steps, top to bottom: { rect | icon | text }. Every colour is a token name; every
 * coordinate an integer. A fact the card does not know is a line it does not draw.
 */
export function cardLayout(f) {
  const { w, h, icon, iconScale } = CARD;
  const well = icon * iconScale + 16;
  const x = 24 + well + 24;
  /** @type {Array<Record<string, any>>} the drawing steps: rect, frame, nine, icon, text (each its own fields) */
  const steps = [
    { op: 'rect', x: 0, y: 0, w, h, fill: '--bg-2' },
    { op: 'frame', x: 1, y: 1, w: w - 2, h: h - 2, stroke: '--line-strong' },
    { op: 'rect', x: 24, y: (h - well) / 2, w: well, h: well, fill: '--bg-1' },
  ];
  /* the standout frame (the game's own PNG, hunt.css .hh-std) one art px outside the icon at the icon's scale, under it */
  const std = STD_FRAMES[f.standing];
  if (f.icon && std) steps.push({ op: 'nine', src: std.src, slice: std.slice, x: 32 - iconScale, y: (h - well) / 2 + 8 - iconScale, size: icon * iconScale + 2 * iconScale, px: iconScale });
  if (f.icon) steps.push({ op: 'icon', src: f.icon, x: 32, y: (h - well) / 2 + 8, size: icon * iconScale });
  const lines = [
    { text: 'A rare find', font: '600 13px', family: '--f-ui', fill: '--ink-3' },
    { text: f.name, font: '600 24px', family: '--f-display', fill: std ? std.ink : '--gold-2' },
    f.hero && { text: 'Found by ' + f.hero, font: '500 16px', family: '--f-ui', fill: '--ink' },
    f.place && { text: 'in ' + f.place, font: '500 14px', family: '--f-ui', fill: '--ink-2' },
    f.date && { text: f.date, font: '500 13px', family: '--f-ui', fill: '--ink-3' },
  ].filter(Boolean);
  const gap = [0, 32, 30, 22, 22];
  let y = 54;
  lines.forEach((l, i) => { y += i ? gap[i] : 0; steps.push(Object.assign({ op: 'text', x, y, align: 'left', max: w - x - 20 }, l)); });
  steps.push({ op: 'text', text: 'Hearthrise', font: '600 14px', family: '--f-display', fill: '--gold-2', x: w - 20, y: h - 18, align: 'right', max: 160 });
  return { w, h, steps };
}

/* Every token a layout names, read from the page; a missing one refuses the card (never a literal colour). */
function tokensOf(doc, layout) {
  const cs = doc.defaultView.getComputedStyle(doc.body);
  const out = {};
  for (const s of layout.steps) for (const k of ['fill', 'stroke', 'family']) {
    if (!s[k] || out[s[k]] !== undefined) continue;
    out[s[k]] = cs.getPropertyValue(s[k]).trim();
    if (!out[s[k]]) throw new Error('share card: token ' + s[k] + ' is not set');
  }
  return out;
}

function loadImage(doc, src) {
  return new Promise((resolve) => {
    const img = new doc.defaultView.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* A 9-slice's border (its centre left empty), each art px `s.px` card px: the four corners as drawn, the edges stretched. */
function drawNine(g, im, s) {
  const n = s.slice, c = n * s.px, mid = im.width - 2 * n, inner = s.size - 2 * c;
  const cuts = [[0, n, 0, c], [n, mid, c, inner], [n + mid, n, c + inner, c]];
  for (const [sy, sh, dy, dh] of cuts) for (const [sx, sw, dx, dw] of cuts) {
    if (sx === n && sy === n) continue;
    g.drawImage(im, sx, sy, sw, sh, s.x + dx, s.y + dy, dw, dh);
  }
}

/** The card on a canvas (CARD.px device pixels per CSS pixel, so the icon lands on an integer grid). */
export async function drawCard(doc, f) {
  const layout = cardLayout(f);
  const tok = tokensOf(doc, layout);
  const icon = layout.steps.find((s) => s.op === 'icon');
  const img = icon ? await loadImage(doc, icon.src) : null;
  const nine = layout.steps.find((s) => s.op === 'nine');
  const frame = nine ? await loadImage(doc, nine.src) : null;
  if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
  const cv = doc.createElement('canvas');
  cv.width = layout.w * CARD.px;
  cv.height = layout.h * CARD.px;
  const g = cv.getContext('2d');
  g.scale(CARD.px, CARD.px);
  g.imageSmoothingEnabled = false;
  g.textBaseline = 'alphabetic';
  for (const s of layout.steps) {
    if (s.op === 'rect') { g.fillStyle = tok[s.fill]; g.fillRect(s.x, s.y, s.w, s.h); }
    else if (s.op === 'frame') { g.strokeStyle = tok[s.stroke]; g.lineWidth = 2; g.strokeRect(s.x, s.y, s.w, s.h); }
    else if (s.op === 'nine') { if (frame) drawNine(g, frame, s); }
    else if (s.op === 'icon') { if (img) g.drawImage(img, s.x, s.y, s.size, s.size); }
    else if (s.op === 'text') {
      g.font = s.font + ' ' + tok[s.family];
      g.fillStyle = tok[s.fill];
      g.textAlign = s.align;
      g.fillText(s.text, s.x, s.y, s.max);
    }
  }
  return cv;
}

/** The card as a PNG, out of the game: the clipboard, else the share sheet, else a download. */
export async function shareCard(doc, f) {
  const win = doc.defaultView;
  const nav = win.navigator;
  let cv;
  try { cv = await drawCard(doc, f); } catch (e) { console.error('[share-card]', e); return { ok: false, error: 'card_failed' }; }
  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
  if (!blob) return { ok: false, error: 'card_failed' };
  const file = 'hearthrise-' + f.item + '.png';
  if (nav.clipboard && typeof nav.clipboard.write === 'function' && typeof win.ClipboardItem === 'function') {
    try { await nav.clipboard.write([new win.ClipboardItem({ 'image/png': blob })]); return { ok: true, how: 'copied' }; } catch (e) { /* no permission: next way */ }
  }
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && typeof win.File === 'function') {
    const files = [new win.File([blob], file, { type: 'image/png' })];
    if (nav.canShare({ files })) {
      try { await nav.share({ files, title: f.name }); return { ok: true, how: 'shared' }; } catch (e) { if (e && e.name === 'AbortError') return { ok: false, error: 'cancelled' }; }
    }
  }
  const url = win.URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = file;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  win.setTimeout(() => win.URL.revokeObjectURL(url), 2000);
  return { ok: true, how: 'saved' };
}
