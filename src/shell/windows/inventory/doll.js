// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/doll.js — THE PAPER DOLL: THE INVENTORY'S EQUIPMENT COLUMN.
//
// The left-hand half of the Inventory (index.js). The worn slots stand in the
// shape of a body, three across and five down, each a small 36 px pocket with
// the piece's 32 px icon at ×1 (a Rare or Signature in its standout frame; an empty slot shows its
// ghost glyph):
//     amulet   helmet   cape
//     weapon   body     offhand
//     ring     legs     ring
//     gloves   boots    earrings
//     ammo     belt
// A slot press opens its line under the window: what is worn there (Unequip)
// and every bag stack that fits it with the change against the worn piece, best
// first (Equip). A bag stack dragged onto a slot wears it; a worn piece dragged
// onto the grid takes it off. Hovering shows the compare tooltip. Each is ONE
// `equip` intent; the doll changes only when the re-read envelope replaces
// `equipment`.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../../data/items.js';
import { EQUIP_SLOT_META, expandItemSlot } from '../../../data/gathering.js';
import { bagOf, skillsOf, shopOf, equipmentOf } from '../../../session/item-sections.js';
import { wornWeights, weightSentence, WEIGHT_ORDER } from '../../../data/armour-weights.js';
import { rows, text, cls, attr, prop, element } from '../../../render/paint.js';
import { escapeHtml as esc } from '../../../utils/dom.js';
import { glyphSvg } from '../../launcher.js';
import { itemIconHtml, itemName } from '../../widgets/bits.js';
import { compare, sortFits } from '../../bag-model.js';
import { needOf } from '../../item-lore.js';
import { gearLocked, GEAR_HUNT_WORDS } from '../../gear-gate.js';
import { busyWords } from '../../training-words.js';
import { whyLine } from '../../widgets/why-line.js';
import { levelOf } from '../../../session/character-sections.js';
import { showTip } from '../item-tip.js';
import { t } from '../../../render/player-text.js';
import { heroGroundOf } from '../../widgets/first-target.js';
import { wornPieceOf, freePiecesOf, piecesOf } from '../../../session/piece-sections.js';
import { pieceName, traitWords, foundWords, standingWord } from '../../piece-words.js';
import { gold } from '../../../render/format.js';

/* Body order, row by row: [slot, label, empty glyph]. */
export const DOLL = Object.freeze([
  ['necklace', 'Amulet', 'uiAmulet'], ['helmet', 'Helmet', 'uiHelm'], ['cape', 'Cape', 'uiCape'],
  ['weapon', 'Weapon', 'uiSword'], ['body', 'Body', 'uiBody'], ['shield', 'Offhand', 'uiShield'],
  ['ring1', 'Ring', 'uiRing'], ['pants', 'Legs', 'uiLegs'], ['ring2', 'Ring', 'uiRing'],
  ['gloves', 'Gloves', 'uiGloves'], ['boots', 'Boots', 'uiBoots'], ['earrings', 'Earrings', 'uiGem'],
  ['ammo', 'Ammo', 'uiArrow'], ['belt', 'Belt', 'uiBar'],
]);
const SLOT_LABEL = new Map(DOLL.map(([s, l]) => [s, l]));
export const DRAG_WORN = 'application/x-hearthrise-worn';

/** Does item `id` go in equip slot `slot`? */
export function fitsSlot(id, slot) {
  return !!(ITEMS[id] && ITEMS[id].slot && expandItemSlot(ITEMS[id].slot).includes(slot));
}

/** The doll column's skeleton. */
export function dollHtml(g) {
  const slot = ([id, label, glyph]) => '<button type="button" class="hw-slot is-empty" data-hs-act="slot" data-slot="' + id + '" draggable="false" aria-label="' + esc(label) + '" title="' + esc(label) + '">'
    + '<span class="hw-ico"></span><span class="hw-ghost">' + glyphSvg(g, glyph) + '</span></button>';
  return '<div class="hw-doll" role="group" aria-label="Worn">' + DOLL.map(slot).join('') + '</div>';
}

/* EVERY WORN SLOT IN VIEW (Tyler 2026-11-17: "the Inventory screen is still clunky, why am i scrolling to see my belt/ammo
   slots?"). The doll never scrolls: its column runs from the toolbar to the window's foot beside the bag (index.js), and where
   the window cannot grow tall enough for its own wells (windows.css: 52 px from 1280 wide) they step down, 2 px at a time, to
   what that column holds, never under DOLL_WELL_MIN (the 32 px icon at x1 and its rim). A phone's sheet keeps its 36 px wells;
   its doll stands beside the toolbar instead (windows.css). */
const DOLL_WELL_MIN = 36;
const DOLL_ROWS = Math.ceil(DOLL.length / 3);

/** The largest even well, in px, whose doll stands `room` px tall with `gap` between its rows and `pad` round them; never under
    DOLL_WELL_MIN. Pure. */
function dollWell(room, gap, pad) {
  const w = Math.floor((room - 2 * pad - (DOLL_ROWS - 1) * gap) / DOLL_ROWS);
  return Math.max(DOLL_WELL_MIN, w - (w % 2));
}

/** The least height the doll stands at: its wells at DOLL_WELL_MIN with its own gaps and rim (index.js placeFoot reads it). */
export function dollLeast(doll, view) {
  const cs = view.getComputedStyle(doll);
  return 2 * (parseFloat(cs.paddingTop) || 0) + DOLL_ROWS * DOLL_WELL_MIN + (DOLL_ROWS - 1) * (parseFloat(cs.rowGap) || 0);
}

const FIT = '--hw-doll-fit';
const FIT_SIG = new WeakMap();
/** Fit the doll's wells to its column (above): measured at its own wells, capped only when they would not show whole. Runs when
    the window's box or the screen changes, so a still window writes nothing. Display only. */
export function fitDoll(root, phone) {
  const doll = root.querySelector('.hw-doll'), cols = root.querySelector('.hw-inv-cols'), frame = root.closest('.hs-win');
  const view = root.ownerDocument.defaultView;
  if (!doll || !cols || !frame || !view) return;
  const sig = () => [phone, view.innerWidth, view.innerHeight, frame.style.maxHeight, frame.offsetHeight, cols.clientHeight, doll.offsetHeight].join('|');
  if (FIT_SIG.get(root) === sig()) return;
  if (doll.style.getPropertyValue(FIT)) doll.style.removeProperty(FIT);
  const room = cols.clientHeight;
  if (!phone && doll.offsetHeight > room + 0.5) {
    const cs = view.getComputedStyle(doll);
    doll.style.setProperty(FIT, dollWell(room, parseFloat(cs.rowGap) || 0, parseFloat(cs.paddingTop) || 0) + 'px');
  }
  FIT_SIG.set(root, sig());
}

/** The worn-weight line's skeleton (beside the doll, under the bag); its hover says what each weight does. */
export function weightsHtml() {
  return '<p class="hw-weights" title="' + esc(WEIGHT_ORDER.map(weightSentence).join(' ')) + '"><small>Armor worn</small>'
    + WEIGHT_ORDER.map((w) => '<span data-weight="' + w + '"></span>').join('') + '</p>';
}

/** Patch the worn-weight line from the server's `equipment` (hidden until the server has sent it). */
export function patchWeights(root, st) {
  const p = root.querySelector('.hw-weights');
  const eq = equipmentOf(st.cs);
  cls(p, 'is-on', !!eq);
  if (eq) for (const x of wornWeights(eq)) text(p.querySelector('[data-weight="' + x.w + '"]'), x.text);
}

/** The open slot's line's skeleton (under both columns). */
export function slotLineHtml() {
  return '<div class="hw-slotline"><h3 class="hw-slothead"></h3>'
    + '<div class="hw-worn"><span class="hw-ico"></span><span class="hw-worn-name"></span><button type="button" class="hh-tool" data-hs-act="unequip">' + t('controls.unequip') + '</button></div>'
    + '<p class="hw-why hw-slot-why" role="status" aria-live="polite"></p>'
    + '<ul class="hw-fits"></ul><p class="hh-empty hw-nofit">Nothing in bag fits here</p>'
    /* the account's free Trait pieces that fit this slot (the server's `pieces` section): Wear, or Sell at the store's price */
    + '<ul class="hw-fits hw-piece-fits"></ul></div>';
}

/* Bag stacks that fit an equip slot, best first by the change against what is worn (bag-model.js sortFits: a weapon by its gain in the
   style it fights in, the hero's own style first). */
function fitsFor(slot, bag, eq) {
  return sortFits(slot, bag.filter((r) => fitsSlot(r.id, slot)).map((r) => ({ id: r.id, qty: r.qty, delta: compare(r.id, eq[slot] || null) })), eq[slot] || null);
}

/** Patch the worn slots from the server's `equipment`. */
export function patchDoll(root, st, ctx) {
  const { eq, sc } = st;
  for (const b of root.querySelectorAll('.hw-doll .hw-slot')) {
    const s = b.getAttribute('data-slot');
    const id = eq[s] || '';
    /* a Trait piece worn here draws in its standout frame (the server's `pieces` row; item-standing.js) */
    const piece = id ? wornPieceOf(st.cs, s) : null;
    if (b.getAttribute('data-item') !== id || b.getAttribute('data-piece') !== (piece ? piece.id : null)) {
      attr(b, 'data-item', id);
      attr(b, 'data-piece', piece ? piece.id : null);
      b.querySelector('.hw-ico').innerHTML = id ? itemIconHtml(ctx.glyphs, piece || id) : '';
      attr(b, 'draggable', id ? 'true' : 'false');
    }
    cls(b, 'is-empty', !id);
    cls(b, 'is-open', sc.slot === s);
    /* The slot an equip is changing, from the press to the server's envelope (actions.js wear). */
    const busy = !!sc.wearing && sc.wearing.slots.includes(s);
    cls(b, 'is-wearing', busy);
    attr(b, 'aria-busy', busy ? 'true' : null);
    attr(b, 'aria-label', SLOT_LABEL.get(s) + ': ' + (piece ? pieceName(piece) + ', ' + standingWord(piece) : id ? itemName(id) : 'empty'));
  }
}

/** Patch the open slot's line: what is worn there, and what in the bag fits. */
export function patchSlotLine(root, st, ctx) {
  const { eq, sc } = st;
  const line = root.querySelector('.hw-slotline');
  cls(line, 'is-on', !!sc.slot);
  if (!sc.slot) return;
  const worn = eq[sc.slot] || null;
  const wornPiece = worn ? wornPieceOf(st.cs, sc.slot) : null;
  text(line.querySelector('.hw-slothead'), SLOT_LABEL.get(sc.slot) || (EQUIP_SLOT_META[sc.slot] && EQUIP_SLOT_META[sc.slot].label) || sc.slot);
  const wr = line.querySelector('.hw-worn');
  cls(wr, 'is-on', !!worn);
  if (wr.getAttribute('data-item') !== (worn || '') || wr.getAttribute('data-piece') !== (wornPiece ? wornPiece.id : null)) {
    attr(wr, 'data-item', worn || ''); attr(wr, 'data-piece', wornPiece ? wornPiece.id : null);
    wr.querySelector('.hw-ico').innerHTML = worn ? itemIconHtml(ctx.glyphs, wornPiece || worn) : '';
  }
  /* a worn piece reads as itself: its name and its Traits (Unequip frees it to the account's pieces, never a plain copy: 1072) */
  text(wr.querySelector('.hw-worn-name'), wornPiece ? pieceName(wornPiece) + (traitWords(wornPiece) ? ' · ' + traitWords(wornPiece) : '') : worn ? itemName(worn) : '');
  /* A running hunt turns every gear press here off (gear-gate.js: the engine refuses it), and the line says why: the hunt's words
     (GEAR_HUNT_WORDS.one), or the yard's while the hero trains (training-words.js busyWords, post-140 audit C7); else the line holds
     its last press's answer. */
  const locked = gearLocked(st.cs);
  const lockWhy = locked ? busyWords(st.cs, GEAR_HUNT_WORDS.one, 'training.busy_gear') : '';
  prop(wr.querySelector('button'), 'disabled', sc.pending || !worn || locked);
  attr(wr.querySelector('button'), 'data-off-why', locked ? lockWhy : null);
  const said = sc.msgAt === 'slot' && !!sc.msg;
  whyLine(line.querySelector('.hw-slot-why'), said ? sc.msg : lockWhy, said);
  const fits = fitsFor(sc.slot, bagOf(st.cs) || [], eq);
  const skills = skillsOf(st.cs);
  const lv = levelOf(st.cs);
  rows(line.querySelector('.hw-fits'), fits, {
    key: (f) => f.id,
    build: (f) => element(ctx.doc, '<li class="hw-fit" data-hs-act="fit-row" data-item="' + esc(f.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, f.id) + '</span>'
      + '<span class="hw-fit-name"><b>' + esc(itemName(f.id)) + '</b><small class="hw-fit-delta"></small><small class="hw-fit-need"></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="wear" data-item="' + esc(f.id) + '">' + t('controls.equip') + '</button></li>'),
    patch: (li, f) => {
      const dl = li.querySelector('.hw-fit-delta');
      const sig = f.delta.map((d) => d.text + d.label).join('|');
      if (dl.getAttribute('data-sig') !== sig) {
        attr(dl, 'data-sig', sig);
        dl.innerHTML = f.delta.length ? f.delta.map((d) => '<span class="' + (d.delta > 0 ? 'is-gain' : 'is-loss') + '">' + esc(d.text + ' ' + d.label) + '</span>').join(', ') : 'No change';
      }
      /* a requirement the server's numbers say is unmet: the row says it, and its Equip is off */
      const need = needOf(f.id, skills, lv ? lv.level : null);
      const short = !!need && need.short;
      text(li.querySelector('.hw-fit-need'), short ? need.text : '');
      prop(li.querySelector('button'), 'disabled', sc.pending || locked || short);
      attr(li.querySelector('button'), 'data-off-why', short ? need.text : locked ? lockWhy : null);
    },
  });
  const pieces = patchPieceFits(line, st, ctx, { locked, lockWhy, skills, level: lv ? lv.level : null });
  cls(line.querySelector('.hw-nofit'), 'is-on', !fits.length && !pieces);
}

/** The equip slot a piece's base goes in first (a ring's: the first ring), or null. */
export function pieceSlotOf(p) {
  const it = p ? ITEMS[p.base] : null;
  return it && it.slot ? expandItemSlot(it.slot)[0] || null : null;
}

/** The strip of the account's free Trait pieces under the bag (hidden while the server sends none): a press opens the piece's slot line. */
export function pieceStripHtml() {
  return '<div class="hw-piece-strip" hidden><small>Rares</small><span class="hw-piece-icons"></span></div>';
}

/** Patch the strip from the server's `pieces` section. */
export function patchPieceStrip(root, st, ctx) {
  const strip = root.querySelector('.hw-piece-strip');
  const list = piecesOf(st.cs) ? freePiecesOf(st.cs) : [];
  prop(strip, 'hidden', !list.length);
  rows(strip.querySelector('.hw-piece-icons'), list, {
    key: (p) => p.id,
    build: (p) => element(ctx.doc, '<button type="button" class="hw-slot" data-hs-act="piece-open" data-piece="' + esc(p.id) + '"><span class="hw-ico">'
      + itemIconHtml(ctx.glyphs, p) + '</span></button>'),
    patch: (el, p) => {
      const words = standingWord(p) + ' ' + pieceName(p) + (traitWords(p) ? ' · ' + traitWords(p) : '');
      attr(el, 'title', words);
      attr(el, 'aria-label', words);
      cls(el, 'is-open', !!st.sc.slot && st.sc.slot === pieceSlotOf(p));
    },
  });
}

/* THE PIECES THAT FIT THE OPEN SLOT (1072-piece-verbs.sql): every free Trait piece of the account whose base goes here, each with Equip (ONE
   hr_piece_wear) and Sell at the price the server sent (`sell`; ONE hr_piece_sell after a second press says the price: a Rare is never sold
   unasked). Off while a press is out, a hunt runs, the hero's Level is short, the store buys none or the day's sales are spent. How many rows. */
function patchPieceFits(line, st, ctx, o) {
  const { sc } = st;
  const sec = piecesOf(st.cs);
  const list = sec ? freePiecesOf(st.cs).filter((p) => fitsSlot(p.base, sc.slot)) : [];
  rows(line.querySelector('.hw-piece-fits'), list, {
    key: (p) => p.id,
    build: (p) => element(ctx.doc, '<li class="hw-fit" data-piece="' + esc(p.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, p) + '</span>'
      + '<span class="hw-fit-name"><b></b><small class="hw-fit-delta"></small><small class="hw-fit-need"></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="wear-piece" data-piece="' + esc(p.id) + '">' + t('controls.equip') + '</button>'
      + '<button type="button" class="hh-tool" data-hs-act="sell-piece" data-piece="' + esc(p.id) + '"></button></li>'),
    patch: (li, p) => {
      text(li.querySelector('b'), standingWord(p) + ' ' + pieceName(p));
      text(li.querySelector('.hw-fit-delta'), traitWords(p));
      const need = needOf(p.base, o.skills, o.level);
      const short = !!need && need.short;
      text(li.querySelector('.hw-fit-need'), short ? need.text : foundWords(p));
      const wearB = li.querySelector('[data-hs-act="wear-piece"]');
      prop(wearB, 'disabled', sc.pending || o.locked || short);
      attr(wearB, 'data-off-why', short ? need.text : o.locked ? o.lockWhy : null);
      const sellB = li.querySelector('[data-hs-act="sell-piece"]');
      const asking = sc.sellPiece === p.id;
      /* off for a rule, the button says which (say-why SW-2): the store buys none, or the day's sales are spent */
      const why = p.sell === null ? 'The store does not buy this' : sec.sellLeft <= 0 ? 'No more sales to the store today' : null;
      text(sellB, why ? why : asking ? 'Sell for ' + gold(p.sell) + '?' : t('controls.sell') + ' · ' + gold(p.sell));
      cls(sellB, 'is-primary', asking && !why);
      prop(sellB, 'disabled', sc.pending || !!why);
      attr(sellB, 'data-off-why', why);
    },
  });
  return list.length;
}

/** The compare tooltip for a worn slot or a fitting stack. */
export function dollTip(ctx, st, el, action) {
  const id = el.getAttribute('data-item');
  if (!id) return;
  const slot = action === 'slot' ? el.getAttribute('data-slot') : st.sc.slot;
  const shop = shopOf(st.cs);
  const lv = levelOf(st.cs);
  /* a worn Trait piece's tip names its step (item-tip.js `piece`): the server's row, read while its base is the slot's */
  const piece = action === 'slot' && el.getAttribute('data-piece') ? wornPieceOf(st.cs, slot) : null;
  showTip(ctx.doc, el, id, { worn: action === 'slot' ? id : (st.eq[slot] || null), skills: skillsOf(st.cs), level: lv ? lv.level : null,
    bid: shop ? (shop.bids.has(id) ? shop.bids.get(id) : null) : undefined, ground: heroGroundOf(st.cs), piece });
}
