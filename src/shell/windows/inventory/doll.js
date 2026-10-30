// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/doll.js — THE PAPER DOLL: THE INVENTORY'S EQUIPMENT COLUMN.
//
// The left-hand half of the Inventory (index.js). The worn slots stand in the
// shape of a body, three across and five down, each a small 36 px pocket with
// the piece's 32 px icon at ×1 framed in its rarity (an empty slot shows its
// ghost glyph):
//     amulet   helmet   cape
//     weapon   body     offhand
//     ring     legs     ring
//     gloves   boots    earrings
//     ammo     belt
// A slot press opens its line under the window: what is worn there (Take off)
// and every bag stack that fits it with the change against the worn piece, best
// first (Wear). A bag stack dragged onto a slot wears it; a worn piece dragged
// onto the grid takes it off. Hovering shows the compare tooltip. Each is ONE
// `equip` intent; the doll changes only when the re-read envelope replaces
// `equipment`.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../../../data/items.js?v=0.2.74';
import { EQUIP_SLOT_META, expandItemSlot } from '../../../data/gathering.js?v=0.2.74';
import { bagOf, skillsOf, shopOf, equipmentOf } from '../../../session/item-sections.js?v=0.2.74';
import { wornWeights, weightSentence, WEIGHT_ORDER } from '../../../data/armour-weights.js?v=0.2.74';
import { rows, text, cls, attr, prop, element } from '../../../render/paint.js?v=0.2.74';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.74';
import { glyphSvg } from '../../launcher.js?v=0.2.74';
import { itemIconHtml, itemName } from '../../widgets/bits.js?v=0.2.74';
import { compare, rarityOf } from '../../bag-model.js?v=0.2.74';
import { needOf } from '../../item-lore.js?v=0.2.74';
import { gearLocked, GEAR_HUNT_WORDS } from '../../gear-gate.js?v=0.2.74';
import { whyLine } from '../../widgets/why-line.js?v=0.2.74';
import { levelOf } from '../../../session/character-sections.js?v=0.2.74';
import { showTip } from '../item-tip.js?v=0.2.74';

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

/** The worn-weight line's skeleton (under both columns); its hover says what each weight does. */
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
    + '<div class="hw-worn"><span class="hw-ico"></span><span class="hw-worn-name"></span><button type="button" class="hh-tool" data-hs-act="unequip">Take off</button></div>'
    + '<p class="hw-why hw-slot-why" role="status" aria-live="polite"></p>'
    + '<ul class="hw-fits"></ul><p class="hh-empty hw-nofit">Nothing in your bag fits here.</p></div>';
}

/* Bag stacks that fit an equip slot, best first by the change against what is worn. */
function fitsFor(slot, bag, eq) {
  return bag.filter((r) => fitsSlot(r.id, slot))
    .map((r) => ({ id: r.id, qty: r.qty, delta: compare(r.id, eq[slot] || null) }))
    .sort((a, b) => b.delta.reduce((s, d) => s + d.delta, 0) - a.delta.reduce((s, d) => s + d.delta, 0));
}

/** Patch the worn slots from the server's `equipment`. */
export function patchDoll(root, st, ctx) {
  const { eq, sc } = st;
  for (const b of root.querySelectorAll('.hw-slot')) {
    const s = b.getAttribute('data-slot');
    const id = eq[s] || '';
    if (b.getAttribute('data-item') !== id) {
      attr(b, 'data-item', id);
      b.querySelector('.hw-ico').innerHTML = id ? itemIconHtml(ctx.glyphs, id) : '';
      for (const c of Array.from(b.classList)) if (c.startsWith('rar-')) b.classList.remove(c);
      if (id && rarityOf(id)) b.classList.add('rar-' + rarityOf(id));
      attr(b, 'draggable', id ? 'true' : 'false');
    }
    cls(b, 'is-empty', !id);
    cls(b, 'is-open', sc.slot === s);
    /* The slot an equip is changing, from the press to the server's envelope (actions.js wear). */
    const busy = !!sc.wearing && sc.wearing.slots.includes(s);
    cls(b, 'is-wearing', busy);
    attr(b, 'aria-busy', busy ? 'true' : null);
    attr(b, 'aria-label', SLOT_LABEL.get(s) + ': ' + (id ? itemName(id) : 'empty'));
  }
}

/** Patch the open slot's line: what is worn there, and what in the bag fits. */
export function patchSlotLine(root, st, ctx) {
  const { eq, sc } = st;
  const line = root.querySelector('.hw-slotline');
  cls(line, 'is-on', !!sc.slot);
  if (!sc.slot) return;
  const worn = eq[sc.slot] || null;
  text(line.querySelector('.hw-slothead'), SLOT_LABEL.get(sc.slot) || (EQUIP_SLOT_META[sc.slot] && EQUIP_SLOT_META[sc.slot].label) || sc.slot);
  const wr = line.querySelector('.hw-worn');
  cls(wr, 'is-on', !!worn);
  if (wr.getAttribute('data-item') !== (worn || '')) { attr(wr, 'data-item', worn || ''); wr.querySelector('.hw-ico').innerHTML = worn ? itemIconHtml(ctx.glyphs, worn) : ''; }
  text(wr.querySelector('.hw-worn-name'), worn ? itemName(worn) : '');
  /* A running hunt turns every gear press here off (gear-gate.js: the engine refuses it), and the line says why;
     else the line holds its last press's answer. */
  const locked = gearLocked(st.cs);
  prop(wr.querySelector('button'), 'disabled', sc.pending || !worn || locked);
  const said = sc.msgAt === 'slot' && !!sc.msg;
  whyLine(line.querySelector('.hw-slot-why'), said ? sc.msg : locked ? GEAR_HUNT_WORDS.one : '', said);
  const fits = fitsFor(sc.slot, bagOf(st.cs) || [], eq);
  const skills = skillsOf(st.cs);
  const lv = levelOf(st.cs);
  rows(line.querySelector('.hw-fits'), fits, {
    key: (f) => f.id,
    build: (f) => element(ctx.doc, '<li class="hw-fit" data-hs-act="fit-row" data-item="' + esc(f.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, f.id) + '</span>'
      + '<span class="hw-fit-name"><b>' + esc(itemName(f.id)) + '</b><small class="hw-fit-delta"></small><small class="hw-fit-need"></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="wear" data-item="' + esc(f.id) + '">Wear</button></li>'),
    patch: (li, f) => {
      const dl = li.querySelector('.hw-fit-delta');
      const sig = f.delta.map((d) => d.text + d.label).join('|');
      if (dl.getAttribute('data-sig') !== sig) {
        attr(dl, 'data-sig', sig);
        dl.innerHTML = f.delta.length ? f.delta.map((d) => '<span class="' + (d.delta > 0 ? 'is-gain' : 'is-loss') + '">' + esc(d.text + ' ' + d.label) + '</span>').join(', ') : 'No change';
      }
      /* a requirement the server's numbers say is unmet: the row says it, and its Wear is off */
      const need = needOf(f.id, skills, lv ? lv.level : null);
      const short = !!need && need.short;
      text(li.querySelector('.hw-fit-need'), short ? need.text : '');
      prop(li.querySelector('button'), 'disabled', sc.pending || locked || short);
    },
  });
  cls(line.querySelector('.hw-nofit'), 'is-on', !fits.length);
}

/** The compare tooltip for a worn slot or a fitting stack. */
export function dollTip(ctx, st, t, action) {
  const id = t.getAttribute('data-item');
  if (!id) return;
  const slot = action === 'slot' ? t.getAttribute('data-slot') : st.sc.slot;
  const shop = shopOf(st.cs);
  const lv = levelOf(st.cs);
  showTip(ctx.doc, t, id, { worn: action === 'slot' ? id : (st.eq[slot] || null), skills: skillsOf(st.cs), level: lv ? lv.level : null,
    bid: shop ? (shop.bids.has(id) ? shop.bids.get(id) : null) : undefined });
}
