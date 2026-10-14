// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-bar.js — THE ACTION BAR, AS DISPLAY (lane B1; Tyler 2026-10-14
// "action bar exactly like Huntera": two rows of ten, a count badge that goes
// red when low, the gold price on a shop slot, "+" on an empty one).
//
// PURE: data in, display rows out. No DOM, no window, no G. Every number it
// shows is the server's or the catalogue's:
//   · a packed slot's count is the bag line's `left` from the server's last
//     read (hr_hunt_analyzer) — never decremented here between reads;
//   · a shop slot's price is src/data/supply-basics.js, the file the server's
//     hr_hunt_basic_supplies is generated from (tools/gen-hunt-sessions.mjs),
//     resolved by the hunt's tier the same way hr_hunt_engine_read resolves it;
//   · "low" is a display threshold on those two server figures, not a rule.
// The bar order IS the firing order (the server walks the slots in order), so
// slots are dense: an empty "+" always appends at the end.
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=582';
import { MONSTERS } from '../data/monsters.js?v=582';
import { SUPPLIES, HEAL_ORDER, bagGuideFor } from '../data/supplies.js?v=582';
import { BASIC_INDEX, basicFor } from '../data/supply-basics.js?v=582';
import { SLOT_TARGETS, RULE_SUBJECTS, RULE_OPERATORS, ACTION_SET_LIMITS, parseSubject } from '../data/rule-subjects.js?v=582';

export const BAR_ROWS = 2;
export const BAR_COLS = ACTION_SET_LIMITS.slots / BAR_ROWS;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const nameOf = (id) => (ITEMS[id] && ITEMS[id].name) || String(id || '').replace(/_/g, ' ');
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

/** The tier a hunt's shop slots resolve by: a named hunt's guide row, else a training fight's monster. */
export function huntTier(huntId) {
  const m = MONSTERS[huntId];
  return bagGuideFor(huntId, m && m.tier).tier || 1;
}

/* Short words for a condition on a 44 px slot; the configure sheet spells them out. */
const SHORT = { self_hp_pct: 'HP', self_mana_pct: 'Mana', session_minutes: 'Min', bag_left: 'Left', buff_left_s: 'Buff', buff_missing: 'No buff' };

/** "HP ≤ 90%" for one stored condition. */
export function conditionText(c) {
  const { base } = parseSubject(c && c.subject);
  const spec = RULE_SUBJECTS[base];
  if (!spec) return String((c && c.subject) || '');
  if (!spec.range) return SHORT[base] || spec.label;
  const op = (RULE_OPERATORS[c.op] || {}).label || c.op;
  return (SHORT[base] || spec.label) + ' ' + op + ' ' + fmt(c.value) + (base.endsWith('_pct') ? '%' : '');
}

/**
 * What one slot holds, resolved for display.
 * @param {string} item  the stored target: '*heal', '*heal_shop', a shop id or a packed item id
 * @param {number} tier  the hunt's tier
 * @returns {{kind, src: 'bag'|'shop', name, art, price?, heals?, dormant?}}
 */
export function resolveTarget(item, tier) {
  const t = SLOT_TARGETS[item];
  if (t) {
    if (t.from === 'shop') {
      const b = basicFor(t.kind, tier);
      return { kind: t.kind, src: 'shop', name: b ? b.n : 'Shop supply', art: b ? b.partner : null, price: b ? b.price : null,
        heals: b && b.heals, basic: b ? b.id : null, dormant: t.kind === 'mana' };
    }
    return { kind: t.kind, src: 'bag', name: t.kind === 'heal' ? 'Cheapest food in your bag' : 'Cheapest drink in your bag',
      art: t.kind === 'heal' ? HEAL_ORDER[0] : null, any: true, dormant: t.kind === 'mana' };
  }
  const b = BASIC_INDEX[item];
  if (b) return { kind: b.kind === 'mana' ? 'mana' : b.kind, src: 'shop', name: b.n, art: b.partner, price: b.price, heals: b.heals, basic: b.id, dormant: b.kind === 'mana' };
  const s = SUPPLIES[item];
  return { kind: s ? s.kind : 'heal', src: 'bag', name: nameOf(item), art: item, heals: s ? s.heals : (ITEMS[item] && ITEMS[item].heals) || 0 };
}

/** A bag line is low when it is empty, under a fifth of what was packed, or the server says it lasts half an hour or less. */
export function isLow(line) {
  if (!line) return true;
  const left = Number(line.left) || 0, loaded = Number(line.loaded) || 0;
  return left <= 0 || left * 5 <= loaded || (line.lasts_h != null && Number(line.lasts_h) <= 0.5);
}

/**
 * The bar's display rows: exactly ACTION_SET_LIMITS.slots entries.
 * @param {{slots: object[], bag: object[]|null, tier: number}} o
 *   bag  the server's bag lines [{item, loaded, left, lasts_h}] — or, on the
 *        packing sheet, the planned lines — or null (no counts known)
 */
export function barModel(o) {
  const slots = Array.isArray(o.slots) ? o.slots : [];
  const bag = Array.isArray(o.bag) ? o.bag : null;
  const line = (id) => (bag ? bag.find((l) => l.item === id) || null : null);
  const out = [];
  for (let i = 0; i < ACTION_SET_LIMITS.slots; i++) {
    const s = slots[i];
    if (!s || typeof s !== 'object') { out.push({ i, empty: true, next: i === slots.length }); continue; }
    const r = resolveTarget(s.item, o.tier);
    let badge = null, art = r.art;
    if (r.src === 'shop') {
      badge = r.price != null && !r.dormant ? { kind: 'price', text: fmt(r.price) + 'g', low: false } : null;
    } else if (r.any) {
      const heals = bag ? bag.filter((l) => (SUPPLIES[l.item] || {}).kind === r.kind) : [];
      const left = heals.reduce((n, l) => n + (Number(l.left) || 0), 0);
      const first = HEAL_ORDER.find((id) => heals.some((l) => l.item === id && Number(l.left) > 0));
      if (first) art = first;
      badge = bag && !r.dormant ? { kind: 'count', text: fmt(left), low: !heals.length || heals.every(isLow) } : null;
    } else {
      const l = line(s.item);
      badge = bag ? { kind: 'count', text: fmt(l ? l.left : 0), low: isLow(l) } : null;
    }
    const conds = Array.isArray(s.conditions) ? s.conditions : [];
    out.push({
      i, empty: false, item: s.item, on: s.on !== false, kind: r.kind, src: r.src, name: r.name, art, badge,
      dormant: !!r.dormant, rule: conds.map(conditionText).join(' · '),
    });
  }
  return out;
}

/** The two quick slots: the first heal and the first buff on the bar (a press fires that bar slot now). */
export function quickModel(bar) {
  const pick = (kind) => bar.find((b) => !b.empty && !b.dormant && b.kind === kind) || null;
  return [pick('heal'), pick('buff')];
}

/**
 * One slot as HTML. `art(id)` returns the item's icon markup (the caller's
 * window lookups; none here).
 */
export function slotHtml(b, art, o) {
  const opt = o || {};
  const attr = opt.attr || 'data-hbar';
  if (b.empty) {
    return '<button type="button" class="hbar-slot is-empty" ' + attr + '="' + b.i + '" aria-label="Empty slot ' + (b.i + 1) + ': add an action">'
      + '<span class="hbar-plus" aria-hidden="true">+</span></button>';
  }
  const title = b.name + (b.dormant ? '. Drinks arrive with the combat update.' : '')
    + (b.rule ? '. When ' + b.rule : '. Always') + (b.on ? '' : '. Off');
  return '<button type="button" class="hbar-slot' + (b.on ? '' : ' is-off') + (b.dormant ? ' is-dormant' : '') + (b.src === 'shop' ? ' is-shop' : '')
    + '" ' + attr + '="' + b.i + '" aria-label="' + esc(title) + '" title="' + esc(title) + '" aria-pressed="' + (b.on ? 'true' : 'false') + '">'
    + '<span class="hbar-art" aria-hidden="true">' + (b.art ? art(b.art) : '') + '</span>'
    + (b.badge ? '<span class="hbar-badge is-' + b.badge.kind + (b.badge.low ? ' is-low' : '') + '">' + esc(b.badge.text) + '</span>' : '')
    + (b.rule ? '<span class="hbar-rule">' + esc(b.rule) + '</span>' : '')
    + '</button>';
}
