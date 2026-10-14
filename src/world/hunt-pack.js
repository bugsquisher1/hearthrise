// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-pack.js — THE SUPPLY BAG: pack before a hunt, restock during
// one (lane B1; ruling HR-2026-10-14 §2 "Supplies: a loaded bag"; master plan
// row 25: shop slots show their price and need no packing, and a character
// whose shop slot is off turns it on with one tap).
//
// The sheet lists what the server says the hero holds (the inventory the
// record keeps absolute) that a hunt may carry: healing food and ammo (buff
// feasts are parked; drinks wait for mana). The player picks quantities — the
// one number the client may send — and the server moves the items under its
// own lock, refusing what is not there (`insufficient_item`, worded from the
// server's own `have` / `need`). Nothing is debited here: the bag and the
// inventory repaint from the re-read.
// The layer is the modal primitive (.hr-scrim / .hr-sheet).
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=584';
import { SUPPLY_ROWS, HEAL_ORDER, bagGuideFor } from '../data/supplies.js?v=584';
import { SESSION_LIMITS } from '../data/hunt-sessions.js?v=584';
import { MONSTERS } from '../data/monsters.js?v=584';
import { barModel, slotHtml, resolveTarget, huntTier } from './hunt-bar.js?v=584';
import { huntName } from './hunt-chrome.js?v=584';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const nameOf = (id) => (ITEMS[id] && ITEMS[id].name) || String(id || '').replace(/_/g, ' ');

/* Packable today, in the order the sheet lists them: food cheapest first, then ammo. */
const PACKABLE = HEAL_ORDER.concat(SUPPLY_ROWS.filter((r) => r[0] === 'ammo').map((r) => r[1]));

/**
 * The sheet's model. PURE.
 * @param {object} o
 *   mode    'pack' | 'restock'
 *   hunt    the hunt id
 *   have    {itemId: n}  the server's inventory
 *   plan    {itemId: n}  the quantities the player has chosen
 *   bag     the open session's bag lines (restock), or null
 *   slots   the chosen action set's slots; preset / sets for the set picker
 */
export function packModel(o) {
  const have = o.have || {}, plan = o.plan || {};
  const inBag = new Set((o.bag || []).map((l) => l.item));
  const lines = PACKABLE.filter((id) => Number(have[id]) > 0).map((id) => ({
    item: id, name: nameOf(id), have: Number(have[id]), qty: Math.max(0, Math.min(Number(have[id]), Math.floor(Number(plan[id]) || 0))),
    ammo: SUPPLY_ROWS.some((r) => r[0] === 'ammo' && r[1] === id), inBag: inBag.has(id),
  }));
  const chosen = lines.filter((l) => l.qty > 0);
  const room = SESSION_LIMITS.bagLines - (o.mode === 'restock' ? new Set([...inBag, ...chosen.map((l) => l.item)]).size : chosen.length);
  const tier = huntTier(o.hunt);
  const planned = chosen.map((l) => ({ item: l.item, left: l.qty, loaded: l.qty }));
  const slots = o.slots || [];
  const shopAt = slots.findIndex((s) => s && s.item === '*heal_shop');
  const shop = resolveTarget('*heal_shop', tier);
  return {
    mode: o.mode, hunt: o.hunt, title: (o.mode === 'restock' ? 'Restock: ' : 'Pack for ') + huntName(o.hunt),
    lines, chosen: chosen.length, over: room < 0, room,
    bar: o.mode === 'pack' ? barModel({ slots, bag: planned, tier }) : null,
    shop: { name: shop.name, price: shop.price, heals: shop.heals, at: shopAt, on: shopAt >= 0 && slots[shopAt].on !== false },
    sets: o.sets || [], preset: o.preset | 0,
    canGo: o.mode === 'pack' ? room >= 0 : chosen.length > 0 && room >= 0,
  };
}

/** The bag a Set Out sends: [{item, qty}] for every chosen line. PURE. */
export function bagOf(model) {
  return model.lines.filter((l) => l.qty > 0).map((l) => ({ item: l.item, qty: l.qty }));
}

/** The guide's suggested bag for this hunt, clamped to what is held. PURE. */
export function suggested(hunt, have) {
  const m = MONSTERS[hunt];
  const g = bagGuideFor(hunt, m && m.tier).melee;
  const out = {};
  if (g && g.heal) out[g.heal.id] = Math.min(Number(have[g.heal.id]) || 0, g.heal.qty);
  return out;
}

function sheetHtml(m, art) {
  const rows = m.lines.length ? m.lines.map((l) => '<li class="hpk-line' + (l.qty > 0 ? ' is-on' : '') + '">'
    + '<span class="hbar-slot is-mini"><span class="hbar-art" aria-hidden="true">' + art(l.item) + '</span></span>'
    + '<span class="hpk-name">' + esc(l.name) + '<small>' + fmt(l.have) + ' held' + (l.inBag ? ' · in your bag' : '') + '</small></span>'
    + '<span class="hcfg-num"><button type="button" data-pk-step="' + esc(l.item) + ':-1" aria-label="Fewer ' + esc(l.name) + '">−</button>'
    + '<input type="number" inputmode="numeric" min="0" max="' + l.have + '" value="' + l.qty + '" data-pk-qty="' + esc(l.item) + '" aria-label="' + esc(l.name) + ' to pack">'
    + '<button type="button" data-pk-step="' + esc(l.item) + ':1" aria-label="More ' + esc(l.name) + '">+</button></span>'
    + '<button type="button" class="whud-link" data-pk-all="' + esc(l.item) + '">All</button></li>').join('')
    : '<li class="hcfg-empty">No food or ammo to pack. Cook some, or turn the shop on below.</li>';
  const shop = m.mode === 'pack' ? '<div class="hpk-shop' + (m.shop.on ? ' is-on' : '') + '"><b>Shop food: ' + esc(m.shop.name) + '</b>'
    + '<span>Heals ' + fmt(m.shop.heals) + '. Costs ' + fmt(m.shop.price) + ' gold per use, paid as it fires. Nothing to pack.</span>'
    + '<button type="button" class="whud-btn is-small" data-pk-shop aria-pressed="' + m.shop.on + '">' + (m.shop.on ? 'On' : 'Turn on') + '</button></div>' : '';
  const sets = m.mode === 'pack' && m.sets.length ? '<label class="whud-set"><span>Action set</span><select data-pk-set aria-label="Action set">'
    + m.sets.map((x) => '<option value="' + x.preset + '"' + (x.preset === m.preset ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' : '';
  const bar = m.bar ? '<div class="whud-bar is-preview" role="group" aria-label="Action bar: click a slot to configure it">' + m.bar.map((b) => slotHtml(b, art, { attr: 'data-pk-slot' })).join('') + '</div>' : '';
  const room = m.over ? '<p class="whud-notice is-inline">A hunt bag holds ' + SESSION_LIMITS.bagLines + ' different supplies.</p>' : '';
  return '<div class="hr-sheet hpk-sheet" role="dialog" aria-modal="true" aria-label="' + esc(m.title) + '">'
    + '<header class="hr-sheet-head hcfg-head"><h3>' + esc(m.title) + '</h3><button type="button" class="hcfg-close" data-hr-dismiss data-pk-close aria-label="Close">×</button></header>'
    + '<div class="hr-sheet-body hpk-body"><ul class="hpk-lines">' + rows + '</ul>' + room
    + (m.mode === 'pack' ? '<button type="button" class="whud-link" data-pk-suggest>Suggested bag</button>' : '')
    + shop + (sets || bar ? '<div class="hpk-bar">' + sets + bar + '</div>' : '') + '</div>'
    + '<footer class="hr-sheet-foot hcfg-foot"><button type="button" class="whud-btn is-primary" data-pk-go' + (m.canGo ? '' : ' disabled') + '>'
    + (m.mode === 'pack' ? 'Set out' : 'Add to bag') + '</button></footer></div>';
}

/**
 * The sheet controller.
 * @param {Document} doc
 * @param {{art, inputs: (mode, hunt) => {have, bag, slots, sets, preset}, go(mode, hunt, bag, preset), shop(on), set(preset), slot(i), paint?}} o
 */
export function createPackSheet(doc, o) {
  let st = null, scrim = null;
  const model = () => packModel(Object.assign({ mode: st.mode, hunt: st.hunt, plan: st.plan, preset: st.preset }, o.inputs(st.mode, st.hunt)));
  const render = () => {
    if (!scrim || !st) return;
    const html = sheetHtml(model(), o.art);
    if (o.paint && typeof o.paint.html === 'function') o.paint.html(scrim, html); else scrim.innerHTML = html;
  };
  const close = () => { if (scrim) scrim.remove(); scrim = null; st = null; };
  const setQty = (id, q) => {
    const have = Number((o.inputs(st.mode, st.hunt).have || {})[id]) || 0;
    st.plan[id] = Math.max(0, Math.min(have, Math.floor(Number(q)) || 0));
  };
  const onClick = (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t || !st) return;
    if (t === scrim || t.closest('[data-pk-close]')) { close(); return; }
    const step = t.closest('[data-pk-step]');
    if (step) {
      const [id, dir] = step.getAttribute('data-pk-step').split(':');
      setQty(id, (st.plan[id] || 0) + Number(dir) * (e.shiftKey ? 10 : 1));
      render(); return;
    }
    const all = t.closest('[data-pk-all]');
    if (all) { const id = all.getAttribute('data-pk-all'); setQty(id, 1e9); render(); return; }
    if (t.closest('[data-pk-suggest]')) { st.plan = Object.assign({}, st.plan, suggested(st.hunt, o.inputs(st.mode, st.hunt).have || {})); render(); return; }
    if (t.closest('[data-pk-shop]')) { o.shop(); return; }
    const slot = t.closest('[data-pk-slot]');
    if (slot) { o.slot(Number(slot.getAttribute('data-pk-slot')), !!e.shiftKey); return; }
    if (t.closest('[data-pk-go]')) {
      const m = model();
      if (!m.canGo) return;
      const mode = st.mode, hunt = st.hunt, preset = st.preset;
      close();
      o.go(mode, hunt, bagOf(m), preset);
    }
  };
  const onChange = (e) => {
    const t = e.target;
    if (!t || !st) return;
    const q = t.getAttribute && t.getAttribute('data-pk-qty');
    if (q != null) { setQty(q, t.value); t.value = st.plan[q]; return; }
    if (t.hasAttribute && t.hasAttribute('data-pk-set')) { st.preset = Number(t.value) | 0; o.set(st.preset); render(); }
  };
  return {
    /** @param {'pack'|'restock'} mode @param {string} hunt @param {number} preset */
    open(mode, hunt, preset) {
      close();
      st = { mode, hunt, plan: {}, preset: preset | 0 };
      if (mode === 'pack') st.plan = suggested(hunt, o.inputs(mode, hunt).have || {});
      scrim = doc.createElement('div');
      scrim.className = 'hr-scrim hpk-scrim';
      scrim.addEventListener('click', onClick);
      scrim.addEventListener('change', onChange);
      doc.body.appendChild(scrim);
      render();
      const go = scrim.querySelector('[data-pk-go]');
      if (go && go.focus) go.focus();
    },
    close, render,
    isOpen: () => !!scrim,
    el: () => scrim,
  };
}
